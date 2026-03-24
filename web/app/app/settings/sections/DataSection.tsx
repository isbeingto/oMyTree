'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { t, type Lang } from '@/lib/i18n';
import { Download, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { signOut } from 'next-auth/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteCurrentUser } from '../hooks/useSettingsApi';

interface DataSectionProps {
  lang: Lang;
  userId: string;
}

export function DataSection({ lang, userId }: DataSectionProps) {
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const deleteMutation = useMutation({
    mutationFn: deleteCurrentUser,
  });
  const isDeleting = deleteMutation.isPending;

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') return;

    try {
      await deleteMutation.mutateAsync();
      toast({
        title: t(lang, 'toast_account_deleted'),
        description: t(lang, 'toast_account_deleted_desc'),
      });
      
      // Sign out and redirect to home
      setTimeout(() => {
        // Clear Ollama device-specific config
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('omytree.ollamaBaseUrl');
        }
        signOut({ callbackUrl: '/' });
      }, 1500);
    } catch (err: any) {
      console.error('Failed to delete account:', err);
      if (typeof err?.status === 'number' && err.status === 403) {
        toast({
          title: t(lang, 'toast_delete_protected'),
          description: t(lang, 'toast_delete_protected_desc'),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t(lang, 'toast_delete_failed'),
        description: err.message || t(lang, 'toast_delete_failed_desc'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => {
        setShowDeleteConfirm(open);
        if (!open) setConfirmText('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">
              {t(lang, 'settings_data_confirm_delete_title')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                {t(lang, 'settings_data_confirm_delete_desc')}
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>{t(lang, 'settings_data_confirm_delete_item_trees')}</li>
                <li>{t(lang, 'settings_data_confirm_delete_item_chats')}</li>
                <li>{t(lang, 'settings_data_confirm_delete_item_links')}</li>
                <li>{t(lang, 'settings_data_confirm_delete_item_api')}</li>
              </ul>
              <p className="font-medium text-red-600 dark:text-red-400">
                {t(lang, 'settings_data_confirm_delete_warning')}
              </p>
              <div className="pt-2">
                <p className="text-sm mb-2">
                  {t(lang, 'settings_data_confirm_delete_type')}
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 rounded-md text-sm glass-field"
                  autoComplete="off"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t(lang, 'shared_trees_cancel')}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAccount}
              disabled={isDeleting || confirmText !== 'DELETE'}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {t(lang, 'settings_data_delete_forever')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Data Card */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/80">
              <Download className="h-4 w-4 text-slate-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{t(lang, 'settings_data_export')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t(lang, 'settings_data_export_desc')}
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 whitespace-nowrap">
            {t(lang, 'settings_coming_soon')}
          </span>
        </div>
      </div>

      {/* Delete Account Card */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm ring-1 ring-red-500/10">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-red-50 dark:bg-red-900/30">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-600 dark:text-red-400">{t(lang, 'settings_data_delete')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t(lang, 'settings_data_delete_desc')}
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-3 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium px-3 py-1.5 transition-colors"
            >
              <Trash2 className="h-3 w-3 inline-block mr-1.5" />
              {t(lang, 'settings_data_delete_account')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
