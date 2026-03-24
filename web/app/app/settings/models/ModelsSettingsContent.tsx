'use client';

import React from 'react';
import ByokSettingsPanel from './ByokSettingsPanel';
import type { Lang } from '@/lib/i18n';
import { AdvancedContextCard } from './AdvancedContextCard';

interface ModelsSettingsContentProps {
  lang: Lang;
}

export function ModelsSettingsContent({ lang }: ModelsSettingsContentProps) {
  return (
    <div className="space-y-6" data-testid="models-settings-content">
      <AdvancedContextCard lang={lang} />
      <ByokSettingsPanel lang={lang} />
    </div>
  );
}

export default ModelsSettingsContent;
