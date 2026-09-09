"use client";

import { ExternalLink } from "lucide-react";
import { buildPublicationChatUrl } from "@/lib/chatgpt";
import type { Publication } from "@/lib/types";

export function ChatGPTButton({ publication }: { publication: Publication }) {
  return (
    <a
      className="chatgpt-button"
      href={buildPublicationChatUrl(publication)}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir ChatGPT con todos los Markdown de esta publicación"
    >
      <ExternalLink size={17} />
      Abrir en ChatGPT
    </a>
  );
}
