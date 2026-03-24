// NOTE: Legacy demo script panel, no longer wired into the UI (T20-5).
// Keep for internal reference only.

import { useMemo } from 'react';
import { BookOpen, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { treeScriptV1, TreeScript } from './treeScript';

type TreeScriptPanelProps = {
  script?: TreeScript;
};

export function TreeScriptPanel({ script }: TreeScriptPanelProps) {
  const { toast } = useToast();
  const activeScript = useMemo(() => script ?? treeScriptV1, [script]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Prompt copied',
        description: 'Paste into ChatPane to record this step.',
      });
    } catch (err) {
      console.error('copy failed', err);
      toast({
        title: 'Copy failed',
        description: 'Please copy manually.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-border/70 bg-card/80">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.08em] text-muted-foreground">
          <BookOpen className="h-4 w-4 text-primary" />
          Demo recording guide
        </div>
        <CardTitle className="text-xl">{activeScript.topic}</CardTitle>
        <p className="text-sm text-muted-foreground">{activeScript.shortTagline}</p>
        <span className="w-fit rounded-md border border-border/70 bg-card/70 px-2 py-1 text-[11px] text-muted-foreground">
          Demo script v1
        </span>
        <p className="text-xs text-muted-foreground">
          Use this script when recording a short demo—it keeps a clean main path and a couple of branches.
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[420px] pr-3">
          <div className="flex flex-col gap-3">
            {activeScript.steps.map((step, index) => (
              <div
                key={step.id}
                className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-border/70 bg-card/70 px-2 py-[2px] text-[10px] uppercase tracking-wide text-muted-foreground">
                      Step {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{step.label}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2"
                    onClick={() => handleCopy(step.prompt)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy prompt
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {step.prompt}
                </p>
                {step.nodeHint && (
                  <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                    Hint: {step.nodeHint}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
