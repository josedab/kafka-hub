"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyFixButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyFix() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy fixed config:", value);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={copyFix}>
      <Copy className="size-3.5" aria-hidden />
      {copied ? "Copied" : "Copy fix"}
    </Button>
  );
}
