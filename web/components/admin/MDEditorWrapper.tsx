"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";

// Import MDEditor and its utilities
let MDEditor: any = null;
let MDEditorKit: any = null;

const MDEditorDynamic = dynamic(
  () =>
    import("@uiw/react-md-editor").then((mod) => {
      MDEditor = mod.default;
      MDEditorKit = mod;
      return mod;
    }),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[320px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
        <span className="text-sm text-slate-400">Loading editor...</span>
      </div>
    ),
  }
);

interface MDEditorWrapperProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function MDEditorWrapper({ value, onChange, placeholder }: MDEditorWrapperProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const colorMode = mounted && resolvedTheme === "dark" ? "dark" : "light";

  // Custom image upload command
  const imageUploadCommand = useMemo(
    () => ({
      name: "image-upload",
      keyCommand: "image-upload",
      buttonProps: { 
        "aria-label": "Upload image", 
        title: "Upload image (支持拖拽)" 
      },
      icon: (
        <svg width="12" height="12" viewBox="0 0 20 20">
          <path
            fill="currentColor"
            d="M15 9c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4-7H1c-.55 0-1 .45-1 1v14c0 .55.45 1 1 1h18c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1zm-1 13l-6-5-2 2-4-5-4 8V4h16v11z"
          />
        </svg>
      ),
      execute: () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;

          try {
            // Create a temporary placeholder
            const placeholderText = `![Uploading ${file.name}...]()`;
            onChange(value + "\n" + placeholderText);

            // Upload the file
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", "image");

            const response = await fetch("/api/admin/upload", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              throw new Error("Upload failed");
            }

            const data = await response.json();

            // Replace placeholder with actual image
            const imageMarkdown = `![${file.name}](${data.url})`;
            const newValue = value.replace(placeholderText, imageMarkdown);
            onChange(newValue + "\n" + imageMarkdown);
          } catch (error) {
            console.error("Image upload failed:", error);
            toast({ title: "图片上传失败", variant: "destructive" });
          }
        };
        input.click();
      },
    }),
    [value, onChange, toast]
  );

  // Enable drag and drop for images
  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );

      if (files.length === 0) return;

      for (const file of files) {
        try {
          // Create a temporary placeholder
          const placeholderText = `![Uploading ${file.name}...]()`;
          onChange(value + "\n" + placeholderText);

          // Upload the file
          const formData = new FormData();
          formData.append("file", file);
          formData.append("type", "image");

          const response = await fetch("/api/admin/upload", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error("Upload failed");
          }

          const data = await response.json();

          // Replace placeholder with actual image
          const imageMarkdown = `![${file.name}](${data.url})`;
          const newValue = value.replace(placeholderText, imageMarkdown);
          onChange(newValue + "\n" + imageMarkdown);
        } catch (error) {
          console.error("Image upload failed:", error);
          toast({ title: "图片上传失败", description: file.name, variant: "destructive" });
        }
      }
    },
    [value, onChange, toast]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Build commands list with default commands + custom image upload
  const commands = useMemo(() => {
    if (!MDEditorKit) return undefined;
    
    try {
      const defaultCommands = MDEditorKit.getCommands?.() || [];
      return [...defaultCommands, imageUploadCommand];
    } catch {
      return undefined;
    }
  }, [imageUploadCommand]);

  return (
    <div 
      data-color-mode={colorMode}
      className="mt-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <MDEditorDynamic
        value={value}
        onChange={(val?: string) => onChange(val ?? "")}
        height={400}
        preview="edit"
        textareaProps={{
          placeholder: placeholder || "Write your content in Markdown...",
        }}
        style={{
          backgroundColor: "transparent",
        }}
        visibleDragbar={true}
        enableScroll={true}
        {...(commands && { commands })}
      />
    </div>
  );
}
