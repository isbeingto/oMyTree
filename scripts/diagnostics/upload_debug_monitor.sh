#!/usr/bin/env bash
# Upload debug monitor: records PM2 logs + memory/FD/thread metrics while you reproduce uploads.
# Usage:
#   bash scripts/diagnostics/upload_debug_monitor.sh
#   UPLOAD_MONITOR_INTERVAL=1 UPLOAD_MONITOR_PM2_APPS="omytree-docreader omytree-weknora" bash scripts/diagnostics/upload_debug_monitor.sh
#
# Output directory:
#   /srv/oMyTree/logs/upload-debug/<timestamp>/

set -euo pipefail

ROOT_DIR="/srv/oMyTree"
LOG_ROOT="${ROOT_DIR}/logs/upload-debug"
RUN_ID="$(date -u '+%Y%m%dT%H%M%SZ')"
RUN_DIR_DEFAULT="${LOG_ROOT}/${RUN_ID}"
RUN_DIR="${1:-${RUN_DIR_DEFAULT}}"

INTERVAL_S="${UPLOAD_MONITOR_INTERVAL:-2}"
PM2_APPS_DEFAULT="omytree-docreader omytree-weknora omytree-api omytree-web"
PM2_APPS="${UPLOAD_MONITOR_PM2_APPS:-${PM2_APPS_DEFAULT}}"

# When docreader RSS exceeds this, take a detailed snapshot.
SNAPSHOT_RSS_MB="${UPLOAD_MONITOR_SNAPSHOT_RSS_MB:-700}"
# When docreader RSS increases by this delta since last sample, take a snapshot.
SNAPSHOT_DELTA_MB="${UPLOAD_MONITOR_SNAPSHOT_DELTA_MB:-250}"

mkdir -p "${RUN_DIR}"

META_FILE="${RUN_DIR}/meta.txt"
EVENTS_FILE="${RUN_DIR}/events.log"
MEMORY_CSV="${RUN_DIR}/memory.csv"

log_event() {
  local level="$1"
  local msg="$2"
  local ts
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "[${ts}] [${level}] ${msg}" | tee -a "${EVENTS_FILE}" >/dev/null
}

die() {
  log_event "ERROR" "$1"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

require_cmd pm2
require_cmd ps
require_cmd awk
require_cmd date

# Optional helpers
HAVE_PGREP=0
if command -v pgrep >/dev/null 2>&1; then
  HAVE_PGREP=1
fi

# Background jobs to clean up
PIDS_TO_KILL=()

cleanup() {
  log_event "INFO" "Stopping monitors..."
  for pid in "${PIDS_TO_KILL[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  log_event "INFO" "Done. Logs are in: ${RUN_DIR}"
}
trap cleanup INT TERM EXIT

write_meta() {
  {
    echo "run_id=${RUN_ID}"
    echo "run_dir=${RUN_DIR}"
    echo "interval_s=${INTERVAL_S}"
    echo "pm2_apps=${PM2_APPS}"
    echo "snapshot_rss_mb=${SNAPSHOT_RSS_MB}"
    echo "snapshot_delta_mb=${SNAPSHOT_DELTA_MB}"
    echo ""
    echo "==== date ===="
    date -u
    echo ""
    echo "==== uname ===="
    uname -a || true
    echo ""
    echo "==== pm2 ls ===="
    pm2 ls || true
    echo ""
    echo "==== free -h ===="
    free -h || true
    echo ""
    echo "==== ulimit -a ===="
    ulimit -a || true
    echo ""
  } >"${META_FILE}"
}

start_pm2_log_capture() {
  for app in ${PM2_APPS}; do
    local out_file="${RUN_DIR}/pm2-${app}.log"
    log_event "INFO" "Starting pm2 logs capture for ${app} -> ${out_file}"

    # --raw to avoid pm2 formatting, --timestamp to include timestamps.
    # Use stdbuf so writes flush promptly.
    if command -v stdbuf >/dev/null 2>&1; then
      (stdbuf -oL -eL pm2 logs "${app}" --raw --timestamp 2>&1 | tee -a "${out_file}" >/dev/null) &
    else
      (pm2 logs "${app}" --raw --timestamp 2>&1 | tee -a "${out_file}" >/dev/null) &
    fi
    PIDS_TO_KILL+=("$!")
  done
}

start_kernel_oom_capture() {
  # Optional: try to follow kernel logs. This may require permissions.
  local out_file="${RUN_DIR}/kernel.log"

  if command -v journalctl >/dev/null 2>&1; then
    if journalctl -k -n 1 >/dev/null 2>&1; then
      log_event "INFO" "Starting kernel log capture (journalctl -k -f) -> ${out_file}"
      if command -v stdbuf >/dev/null 2>&1; then
        (stdbuf -oL -eL journalctl -k -f 2>&1 | tee -a "${out_file}" >/dev/null) &
      else
        (journalctl -k -f 2>&1 | tee -a "${out_file}" >/dev/null) &
      fi
      PIDS_TO_KILL+=("$!")
      return
    fi
  fi

  if command -v dmesg >/dev/null 2>&1; then
    if dmesg -T | tail -n 1 >/dev/null 2>&1; then
      log_event "INFO" "Starting kernel log capture (dmesg -w) -> ${out_file}"
      if command -v stdbuf >/dev/null 2>&1; then
        (stdbuf -oL -eL dmesg -w 2>&1 | tee -a "${out_file}" >/dev/null) &
      else
        (dmesg -w 2>&1 | tee -a "${out_file}" >/dev/null) &
      fi
      PIDS_TO_KILL+=("$!")
      return
    fi
  fi

  log_event "WARN" "Kernel log capture not available (permission or missing tools)."
}

get_threads() {
  local pid="$1"
  awk '/^Threads:/{print $2}' "/proc/${pid}/status" 2>/dev/null || echo "0"
}

get_fd_count() {
  local pid="$1"
  ls -1 "/proc/${pid}/fd" 2>/dev/null | wc -l | tr -d ' ' || echo "0"
}

dump_snapshot_for_pid() {
  local app="$1"
  local pid="$2"
  local reason="$3"
  local ts
  ts="$(date -u '+%Y%m%dT%H%M%SZ')"

  local snap_dir="${RUN_DIR}/snapshot-${app}-${pid}-${ts}"
  mkdir -p "${snap_dir}"

  log_event "WARN" "Snapshot: app=${app} pid=${pid} reason=${reason} dir=${snap_dir}"

  {
    echo "app=${app}"
    echo "pid=${pid}"
    echo "reason=${reason}"
    echo "time=${ts}"
    echo ""
    echo "==== ps ===="
    ps -p "${pid}" -o pid,ppid,etime,rss,vsz,pcpu,pmem,cmd --no-headers || true
  } >"${snap_dir}/summary.txt"

  if command -v pmap >/dev/null 2>&1; then
    pmap -x "${pid}" >"${snap_dir}/pmap-x.txt" 2>/dev/null || true
  fi

  cat "/proc/${pid}/status" >"${snap_dir}/proc-status.txt" 2>/dev/null || true
  cat "/proc/${pid}/smaps_rollup" >"${snap_dir}/smaps_rollup.txt" 2>/dev/null || true

  # FD list can be huge; record counts + top-level link targets.
  get_fd_count "${pid}" >"${snap_dir}/fd-count.txt" 2>/dev/null || true
  if command -v ls >/dev/null 2>&1; then
    ls -l "/proc/${pid}/fd" >"${snap_dir}/fd-list.txt" 2>/dev/null || true
  fi

  # If lsof exists, capture a compact summary.
  if command -v lsof >/dev/null 2>&1; then
    lsof -p "${pid}" >"${snap_dir}/lsof.txt" 2>/dev/null || true
  fi
}

write_csv_header() {
  echo "ts,app,pid,root_pid,rss_mb,vsz_mb,cpu_pct,threads,fd_count,cmd" >"${MEMORY_CSV}"
}

get_descendants() {
  local parent="$1"
  if [ "${HAVE_PGREP}" -ne 1 ]; then
    return 0
  fi
  local children
  children="$(pgrep -P "${parent}" 2>/dev/null || true)"
  if [ -z "${children}" ]; then
    return 0
  fi
  while IFS= read -r c; do
    [ -z "${c}" ] && continue
    echo "${c}"
    get_descendants "${c}"
  done <<<"${children}"
}

get_app_pids() {
  local app="$1"
  local include_children
  include_children="${UPLOAD_MONITOR_INCLUDE_CHILDREN:-1}"

  # Fast-path: stable pgrep patterns (especially important when pm2 starts a wrapper).
  if [ "${HAVE_PGREP}" -eq 1 ]; then
    if [ "${app}" = "omytree-docreader" ]; then
      local docs
      docs="$(pgrep -f 'docreader\.main' 2>/dev/null || true)"
      if [ -n "${docs}" ]; then
        while IFS= read -r pid; do
          [ -z "${pid}" ] && continue
          echo "${pid} ${pid}"
          if [ "${include_children}" = "1" ] || [ "${include_children}" = "true" ] || [ "${include_children}" = "yes" ]; then
            while IFS= read -r child; do
              [ -z "${child}" ] && continue
              echo "${child} ${pid}"
            done < <(get_descendants "${pid}" || true)
          fi
        done <<<"${docs}"
        return 0
      fi
    elif [ "${app}" = "omytree-weknora" ]; then
      local ws
      ws="$(pgrep -x WeKnora 2>/dev/null || true)"
      if [ -n "${ws}" ]; then
        while IFS= read -r pid; do
          [ -z "${pid}" ] && continue
          echo "${pid} 0"
        done <<<"${ws}"
        return 0
      fi
    fi
  fi

  local roots
  if command -v timeout >/dev/null 2>&1; then
    roots="$(timeout 2 pm2 pid "${app}" 2>/dev/null || true)"
  else
    roots="$(pm2 pid "${app}" 2>/dev/null || true)"
  fi
  if [ -z "${roots}" ]; then
    return 0
  fi

  while IFS= read -r root; do
    [ -z "${root}" ] && continue
    echo "${root} ${root}"
    if [ "${include_children}" = "1" ] || [ "${include_children}" = "true" ] || [ "${include_children}" = "yes" ]; then
      while IFS= read -r child; do
        [ -z "${child}" ] && continue
        echo "${child} ${root}"
      done < <(get_descendants "${root}" || true)
    fi
  done <<<"${roots}"
}

sample_memory_once() {
  local ts
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  for app in ${PM2_APPS}; do
    local pairs
    pairs="$(get_app_pids "${app}" || true)"
    if [ -z "${pairs}" ]; then
      continue
    fi

    while IFS=$' \t' read -r pid root_pid; do
      if [ -z "${pid}" ]; then
        continue
      fi
      root_pid="${root_pid:-0}"
      if [ ! -r "/proc/${pid}/status" ]; then
        continue
      fi

      local rss_kb vsz_kb cpu cmd threads fd_count
      rss_kb="$(ps -p "${pid}" -o rss= --no-headers 2>/dev/null | awk '{print $1}' || echo "0")"
      vsz_kb="$(ps -p "${pid}" -o vsz= --no-headers 2>/dev/null | awk '{print $1}' || echo "0")"
      cpu="$(ps -p "${pid}" -o %cpu= --no-headers 2>/dev/null | awk '{print $1}' || echo "0")"
      cmd="$(ps -p "${pid}" -o cmd= --no-headers 2>/dev/null || true)"
      cmd="${cmd//$'\n'/ }"
      # CSV escaping: double double-quotes inside a quoted field.
      cmd="${cmd//\"/\"\"}"

      local rss_mb vsz_mb
      rss_mb="$(awk -v kb="${rss_kb:-0}" 'BEGIN{printf "%.1f", kb/1024}')"
      vsz_mb="$(awk -v kb="${vsz_kb:-0}" 'BEGIN{printf "%.1f", kb/1024}')"

      threads="$(get_threads "${pid}")"
      fd_count="$(get_fd_count "${pid}")"

      echo "${ts},${app},${pid},${root_pid},${rss_mb},${vsz_mb},${cpu},${threads},${fd_count},\"${cmd}\"" >>"${MEMORY_CSV}"
    done <<<"${pairs}"
  done
}

main_loop() {
  log_event "INFO" "Starting memory sampler -> ${MEMORY_CSV}"

  # Track last rss for docreader pids for delta snapshots.
  declare -A last_rss_mb

  while true; do
    sample_memory_once

    # docreader snapshot logic (include children, e.g. OCR worker)
    local doc_pairs
    doc_pairs="$(get_app_pids "omytree-docreader" || true)"
    if [ -n "${doc_pairs}" ]; then
      while IFS=$' \t' read -r pid root_pid; do
        [ -z "${pid}" ] && continue
        if [ ! -r "/proc/${pid}/status" ]; then
          continue
        fi

        local rss_kb rss_mb_num rss_mb_str
        rss_kb="$(ps -p "${pid}" -o rss= --no-headers 2>/dev/null | awk '{print $1}' || echo "0")"
        rss_mb_str="$(awk -v kb="${rss_kb:-0}" 'BEGIN{printf "%.1f", kb/1024}')"
        rss_mb_num="$(awk -v s="${rss_mb_str}" 'BEGIN{printf "%d", s+0}')"

        local last="${last_rss_mb[${pid}]:-0}"
        local delta=$((rss_mb_num - last))
        last_rss_mb[${pid}]="${rss_mb_num}"

        if [ "${rss_mb_num}" -ge "${SNAPSHOT_RSS_MB}" ]; then
          dump_snapshot_for_pid "omytree-docreader" "${pid}" "rss_mb>=${SNAPSHOT_RSS_MB} (rss=${rss_mb_str}MB root=${root_pid})"
        elif [ "${delta}" -ge "${SNAPSHOT_DELTA_MB}" ]; then
          dump_snapshot_for_pid "omytree-docreader" "${pid}" "delta_mb>=${SNAPSHOT_DELTA_MB} (delta=${delta}MB rss=${rss_mb_str}MB root=${root_pid})"
        fi
      done <<<"${doc_pairs}"
    fi

    sleep "${INTERVAL_S}"
  done
}

log_event "INFO" "Upload debug monitor starting"
write_meta
write_csv_header
start_pm2_log_capture
start_kernel_oom_capture

log_event "INFO" "Reproduce uploads now. Press Ctrl+C to stop."
echo ""
echo "Upload debug monitor is running."
echo "Logs dir: ${RUN_DIR}"
echo "- memory: ${MEMORY_CSV}"
echo "- events: ${EVENTS_FILE}"
echo "- pm2 logs: pm2-*.log"
echo ""

main_loop
