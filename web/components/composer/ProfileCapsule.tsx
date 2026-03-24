'use client';

import React, { useState, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';

type Profile = 'lite' | 'standard' | 'max';
type Scope = 'branch' | 'tree';

export interface ProfileCapsuleProps {
  /** Currently selected profile */
  profile: Profile | null;
  /** Currently selected memory scope */
  scope: Scope;
  /** Callback when profile changes */
  onProfileChange: (value: Profile) => void;
  /** Callback when scope changes */
  onScopeChange: (value: Scope) => void;
  /** Whether Max profile is disabled (user not using BYOK) */
  isMaxDisabled?: boolean;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** User language */
  lang?: Lang;
  /** Custom class name */
  className?: string;
}

/**
 * Two-segment capsule profile picker for advanced context mode
 * Left: Profile selection (Lite / Standard / Max)
 * Right: Memory scope selection (Branch / Tree)
 * 
 * Matches ModelPicker styling for visual consistency.
 */
export function ProfileCapsule({
  profile,
  scope,
  onProfileChange,
  onScopeChange,
  isMaxDisabled = false,
  disabled = false,
  lang = 'en',
  className,
}: ProfileCapsuleProps) {
  // Track which dropdown is open - only one can be open at a time
  const [openDropdown, setOpenDropdown] = useState<'profile' | 'scope' | null>(null);

  const handleProfileOpenChange = useCallback((open: boolean) => {
    setOpenDropdown(open ? 'profile' : null);
  }, []);

  const handleScopeOpenChange = useCallback((open: boolean) => {
    setOpenDropdown(open ? 'scope' : null);
  }, []);

  // Profile options with i18n descriptions (labels stay as Lite/Standard/Max)
  const profileOptions = [
    { value: 'lite' as Profile, label: 'Lite', desc: t(lang, 'profile_lite_desc') },
    { value: 'standard' as Profile, label: 'Standard', desc: t(lang, 'profile_standard_desc') },
    { value: 'max' as Profile, label: 'Max', desc: t(lang, 'profile_max_desc') },
  ];

  // Scope options with i18n
  const scopeOptions = [
    { value: 'branch' as Scope, label: t(lang, 'memory_scope_branch'), desc: t(lang, 'memory_scope_branch_desc') },
    { value: 'tree' as Scope, label: t(lang, 'memory_scope_tree'), desc: t(lang, 'memory_scope_tree_desc') },
  ];

  // T54-1: Display selected profile label directly (default to Lite if null)
  const displayProfile = profile || 'lite';
  const profileLabel = profileOptions.find(o => o.value === displayProfile)?.label || displayProfile;
  const scopeLabel = scopeOptions.find(o => o.value === scope)?.label || scope;

  return (
    <div className={cn('flex items-center transition-all duration-300 ease-out', className)}>
      {/* Profile Selector (Left Capsule) */}
      <Select
          value={displayProfile}
          onValueChange={(v) => onProfileChange(v as Profile)}
          disabled={disabled}
          open={openDropdown === 'profile'}
          onOpenChange={handleProfileOpenChange}
        >
          <SelectTrigger
            className={cn(
              'h-8 min-w-[70px] w-auto rounded-r-none border-r-0 pl-3 pr-2',
              'border-transparent bg-transparent text-xs font-medium shadow-none',
              'dark:border-transparent dark:bg-transparent',
              'focus:ring-0 focus:ring-offset-0',
              'transition-colors duration-200 ease-out'
            )}
            data-testid="profile-select-trigger"
          >
            <SelectValue>
              <span className="whitespace-nowrap">{profileLabel}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            className="min-w-[180px] glass-dropdown"
            side="bottom"
            align="end"
            sideOffset={8}
          >
            {profileOptions.map((opt) => {
              const isDisabled = opt.value === 'max' && isMaxDisabled;
              return (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  className={cn('text-xs', isDisabled && 'opacity-60')}
                  disabled={isDisabled}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{opt.label}</span>
                      {isDisabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                          {t(lang, 'profile_max_need_byok')}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Scope Selector (Right Capsule) */}
        <Select
          value={scope}
          onValueChange={(v) => onScopeChange(v as Scope)}
          disabled={disabled}
          open={openDropdown === 'scope'}
          onOpenChange={handleScopeOpenChange}
        >
          <SelectTrigger
            className={cn(
              'h-8 min-w-[70px] w-auto rounded-l-none pl-2 pr-3',
              'border-transparent bg-transparent text-xs font-medium shadow-none',
              'dark:border-transparent dark:bg-transparent',
              'focus:ring-0 focus:ring-offset-0',
              'transition-colors duration-200 ease-out'
            )}
            data-testid="scope-select-trigger"
          >
            <SelectValue>
              <span className="whitespace-nowrap">{scopeLabel}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            className="min-w-[180px] glass-dropdown"
            side="bottom"
            sideOffset={8}
          >
            {scopeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
    </div>
  );
}
