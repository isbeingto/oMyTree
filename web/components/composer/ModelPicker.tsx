'use client';

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Provider information
 */
export interface ProviderInfo {
  id: string;
  name: string;
  badge?: string;
}

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  /** For unified BYOK: the provider kind (e.g., 'openai', 'deepseek') */
  providerKind?: string;
  /** For unified BYOK: display label of the provider (e.g., 'OpenAI', 'DeepSeek') */
  providerLabel?: string;
}

/**
 * Provider with its models
 */
export interface ProviderWithModels extends ProviderInfo {
  models: ModelInfo[];
  hasApiKey?: boolean;
  isByok?: boolean;
  disabled?: boolean;
  /** True when BYOK has no configured providers yet */
  notConfigured?: boolean;
  /** True when the provider is Ollama (Local) */
  isOllama?: boolean;
}

export interface ModelPickerProps {
  /** All available providers with their models */
  providers: ProviderWithModels[];
  /** Currently selected provider ID */
  selectedProviderId: string | null;
  /** Currently selected model ID */
  selectedModelId: string | null;
  /** Callback when provider changes */
  onProviderChange: (providerId: string) => void;
  /** Callback when model changes */
  onModelChange: (modelId: string) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Whether models are loading */
  loading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Custom class name */
  className?: string;
  /** Expansion direction (top or bottom) */
  side?: 'top' | 'bottom';
}

/**
 * Two-segment capsule model picker
 * Left: Provider selection (oMyTree Default / OpenAI / Google AI)
 * Right: Model selection (depends on provider)
 */
export function ModelPicker({
  providers,
  selectedProviderId,
  selectedModelId,
  onProviderChange,
  onModelChange,
  disabled = false,
  loading = false,
  error = null,
  className,
  side = 'top',
}: ModelPickerProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');

    const update = () => {
      setIsMobile(mql.matches || window.innerWidth < 768);
    };

    update();
    mql.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mql.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Find selected provider
  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) ?? null,
    [providers, selectedProviderId]
  );

  // Get enabled models for selected provider
  const enabledModels = useMemo(() => {
    if (!selectedProvider || selectedProvider.disabled) return [];
    return selectedProvider.models.filter((m) => m.enabled !== false);
  }, [selectedProvider]);

  // Group enabled models by providerLabel for BYOK display
  const groupedModels = useMemo(() => {
    if (!selectedProvider?.isByok) return null;
    const groups = new Map<string, ModelInfo[]>();
    for (const m of enabledModels) {
      const label = m.providerLabel || 'Other';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(m);
    }
    return groups.size > 1 ? groups : null; // Only group if multiple providers
  }, [enabledModels, selectedProvider]);

  // Check if selected model is still valid
  const isValidModel = useMemo(() => {
    if (!selectedModelId || !selectedProvider) return false;
    return enabledModels.some((m) => m.id === selectedModelId);
  }, [enabledModels, selectedModelId, selectedProvider]);

  // Get model display info
  const selectedModel = useMemo(() => {
    if (!selectedProvider || !selectedModelId) return null;
    return selectedProvider.models.find((m) => m.id === selectedModelId) ?? null;
  }, [selectedProvider, selectedModelId]);

  // Determine provider display name
  const providerDisplayName = useMemo(() => {
    if (!selectedProvider) return loading ? '加载中...' : '选择提供商';
    return selectedProvider.name;
  }, [selectedProvider, loading]);

  // Whether BYOK is selected but not configured
  const isByokNotConfigured = Boolean(selectedProvider?.isByok && selectedProvider?.notConfigured);

  // Whether Ollama is selected but not configured on this device
  const isOllamaNotConfigured = Boolean(selectedProvider?.isOllama && selectedProvider?.notConfigured);

  // Combined: either BYOK or Ollama not configured
  const isNotConfigured = isByokNotConfigured || isOllamaNotConfigured;

  // Determine model display name
  const modelDisplayName = useMemo(() => {
    if (!selectedProvider) return '—';
    if (isNotConfigured) return '暂未配置';
    if (enabledModels.length === 0) return '无可用模型';
    if (!selectedModel) return '选择模型';
    return selectedModel.name;
  }, [selectedProvider, enabledModels.length, selectedModel, isNotConfigured]);

  // Handle provider change
  const handleProviderChange = (providerId: string) => {
    onProviderChange(providerId);
    // Auto-select first enabled model when provider changes
    const newProvider = providers.find((p) => p.id === providerId);
    if (newProvider) {
      const firstEnabled = newProvider.models.find((m) => m.enabled !== false);
      if (firstEnabled) {
        onModelChange(firstEnabled.id);
      }
    }
  };

  const hasNoModels = selectedProvider && enabledModels.length === 0 && !isNotConfigured;

  // T30: Track which dropdown is open - only one can be open at a time
  const [openDropdown, setOpenDropdown] = useState<'provider' | 'model' | null>(null);

  const handleProviderOpenChange = useCallback((open: boolean) => {
    setOpenDropdown(open ? 'provider' : null);
  }, []);

  const handleModelOpenChange = useCallback((open: boolean) => {
    setOpenDropdown(open ? 'model' : null);
  }, []);

  const mobileSelectBaseClassName =
    'h-8 min-w-[80px] max-w-max border-transparent bg-transparent text-xs font-medium shadow-none focus:outline-none focus:ring-0 focus:ring-offset-0 transition-colors duration-200 ease-out appearance-none pr-7';

  const selectContentGlassClassName = 'glass-dropdown';

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {isMobile ? (
        <div className="inline-flex items-center transition-all duration-300 ease-out">
          <div className="relative inline-block">
            <select
              className={cn(
                mobileSelectBaseClassName,
                'rounded-r-none border-r-0 pl-3',
                'w-auto'
              )}
              style={{ width: `${Math.max(85, (providerDisplayName?.length || 8) * 7.8 + 30)}px` }}
              value={selectedProviderId || ''}
              onChange={(e) => handleProviderChange(e.target.value)}
              disabled={disabled || loading || providers.length === 0}
              data-testid="provider-select-native"
            >
              <option value="" disabled>
                {loading ? '加载中...' : '选择提供商'}
              </option>
              {providers.map((provider) => {
                const providerDisabled =
                  provider.disabled === true ||
                  (!provider.isByok && (provider.models || []).every((m) => m.enabled === false));
                return (
                  <option key={provider.id} value={provider.id} disabled={providerDisabled}>
                    {provider.name}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          </div>

          <div className="relative inline-block">
            <select
              className={cn(
                mobileSelectBaseClassName,
                'rounded-l-none pl-2',
                'w-auto',
                (hasNoModels || isNotConfigured) && 'text-muted-foreground'
              )}
              style={{ width: `${Math.max(85, (modelDisplayName?.length || 8) * 7.8 + 30)}px` }}
              value={isValidModel ? (selectedModelId || '') : ''}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={Boolean(disabled || loading || !selectedProvider || hasNoModels || isNotConfigured)}
              data-testid="model-select-native"
            >
              <option value="" disabled>
                {isNotConfigured ? '暂未配置' : hasNoModels ? '无可用模型' : '选择模型'}
              </option>
              {isNotConfigured ? (
                <option value="_not_configured" disabled>
                  {isOllamaNotConfigured
                    ? '本设备未配置 Ollama，请前往设置页配置'
                    : '暂未配置 BYOK，请前往设置页添加 API Key'}
                </option>
              ) : enabledModels.length > 0 ? (
                groupedModels ? (
                  // BYOK: render models grouped by provider label (native optgroup)
                  Array.from(groupedModels.entries()).map(([groupLabel, models]) => (
                    <optgroup key={groupLabel} label={groupLabel}>
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </optgroup>
                  ))
                ) : (
                  enabledModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))
                )
              ) : (
                <option value="_empty" disabled>
                  无启用的模型，请前往设置页配置
                </option>
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      ) : (
        <div className="flex items-center transition-all duration-300 ease-out">
          {/* Provider Selector (Left Capsule) */}
          <Select
            value={selectedProviderId || undefined}
            onValueChange={handleProviderChange}
            disabled={disabled || loading || providers.length === 0}
            open={openDropdown === 'provider'}
            onOpenChange={handleProviderOpenChange}
          >
            <SelectTrigger
              className={cn(
                'h-8 min-w-[80px] w-auto rounded-r-none border-r-0 pl-3 pr-2',
                'border-transparent bg-transparent text-xs font-medium shadow-none',
                'dark:border-transparent dark:bg-transparent',
                'focus:ring-0 focus:ring-offset-0',
                'transition-colors duration-200 ease-out'
              )}
              data-testid="provider-select-trigger"
            >
              <SelectValue placeholder={loading ? '加载中...' : '选择提供商'}>
                <span className="whitespace-nowrap">{providerDisplayName}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              className={cn('min-w-[180px] w-56', selectContentGlassClassName)}
              side={side}
              align="end"
              sideOffset={8}
            >
              {providers.map((provider) => {
                const providerDisabled =
                  provider.disabled === true ||
                  (!provider.isByok && (provider.models || []).every((m) => m.enabled === false));
                return (
                  <SelectItem
                    key={provider.id}
                    value={provider.id}
                    className={cn('text-xs', providerDisabled && 'opacity-60 pointer-events-none')}
                    disabled={providerDisabled}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{provider.name}</span>
                      {provider.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                          {provider.badge}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Model Selector (Right Capsule) */}
          <Select
            value={isValidModel ? (selectedModelId || undefined) : undefined}
            onValueChange={onModelChange}
            disabled={Boolean(disabled || loading || !selectedProvider || hasNoModels) && !isNotConfigured}
            open={openDropdown === 'model'}
            onOpenChange={handleModelOpenChange}
          >
            <SelectTrigger
              className={cn(
                'h-8 min-w-[80px] w-auto rounded-l-none pl-2 pr-3',
                'border-transparent bg-transparent text-xs font-medium shadow-none',
                'dark:border-transparent dark:bg-transparent',
                'focus:ring-0 focus:ring-offset-0',
                'transition-colors duration-200 ease-out',
                (hasNoModels || isNotConfigured) && 'text-muted-foreground'
              )}
              data-testid="model-select-trigger"
            >
              <SelectValue placeholder={isNotConfigured ? '暂未配置' : hasNoModels ? '无可用模型' : '选择模型'}>
                <span className="whitespace-nowrap">{modelDisplayName}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              className={cn('min-w-[180px] max-w-[280px] w-[280px]', selectContentGlassClassName)}
              side={side}
              sideOffset={8}
            >
              {isNotConfigured ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-muted-foreground mb-2">
                    {isOllamaNotConfigured
                      ? '本设备未配置 Ollama'
                      : '暂未配置 BYOK 密钥'}
                  </p>
                  <button
                    type="button"
                    className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(new CustomEvent('openSettings', { detail: { tab: 'models' } }));
                    }}
                  >
                    {isOllamaNotConfigured
                      ? '前往设置页配置 Ollama →'
                      : '前往设置页添加 API Key →'}
                  </button>
                </div>
              ) : enabledModels.length > 0 ? (
                groupedModels ? (
                  // BYOK: render models grouped by provider label
                  Array.from(groupedModels.entries()).map(([groupLabel, models]) => (
                    <SelectGroup key={groupLabel}>
                      <SelectLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                        {groupLabel}
                      </SelectLabel>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id} className="text-xs">
                          <div className="flex flex-col gap-0.5 max-w-[250px]">
                            <span className="font-medium truncate">{model.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                ) : (
                  // Default or single-provider BYOK: flat list
                  enabledModels.map((model) => (
                    <SelectItem key={model.id} value={model.id} className="text-xs">
                      <div className="flex flex-col gap-0.5 max-w-[250px]">
                        <span className="font-medium truncate">{model.name}</span>
                      </div>
                    </SelectItem>
                  ))
                )
              ) : (
                <SelectItem value="_empty" disabled className="text-xs text-muted-foreground">
                  无启用的模型，请前往设置页配置
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Error message only - no hint for missing models */}
      {error && (
        <span className="text-[11px] leading-none text-destructive">{error}</span>
      )}
    </div>
  );
}

/**
 * Compact single-line display of current selection
 * Used in AI message cards to show which model generated the response
 */
export interface ModelTagProps {
  provider?: string | null;
  providerLabel?: string | null;
  model?: string | null;
  modelLabel?: string | null;
  isByok?: boolean | null;
  className?: string;
}

export function ModelTag({
  provider,
  providerLabel,
  model,
  modelLabel,
  isByok,
  className,
}: ModelTagProps) {
  if (!provider && !model) {
    return (
      <span className={cn('text-[11px] text-muted-foreground', className)}>
        Legacy
      </span>
    );
  }

  const displayProvider = providerLabel || provider || 'Unknown';
  const displayModel = modelLabel || model || '';
  const suffix = isByok ? ' (BYOK)' : '';

  return (
    <span className={cn('text-[11px] text-muted-foreground', className)}>
      {displayProvider}
      {displayModel && ` · ${displayModel}`}
      {suffix}
    </span>
  );
}
