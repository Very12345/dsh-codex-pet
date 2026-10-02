/** Fork versions are distributed through GitHub; upstream npm updates are separate. */
import React, { useSyncExternalStore } from "react";
import { GithubMark16, FeedbackMark16 } from "./project-icons.tsx";
import type { PetLocaleStore } from "./pet-locales.ts";
declare const __PET_VERSION__: string;
export function PluginUpdateHeader({ locale }: { locale?: PetLocaleStore }) {
  const language = useSyncExternalStore(
    (fn) => locale?.subscribe(fn) ?? (() => {}),
    () => locale?.getSnapshot().active ?? "zh",
  );
  const zh = /^zh(?:-|$)/i.test(language);
  return (
    <>
      <style>{`.dcp-project-head{display:flex;align-items:center;justify-content:flex-start;gap:8px 12px;flex-wrap:wrap;margin-bottom:24px}.dcp-project-head h1{display:inline-flex;align-items:baseline;margin:0;white-space:nowrap}.dcp-version{font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-tertiary,#9da1aa);margin-left:10px}.dcp-project-links{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.dcp-project-links a,.dcp-project-links button{display:inline-flex;align-items:center;justify-content:center;gap:5px;box-sizing:border-box;min-height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#383838);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font-family:inherit;font-size:12px;font-weight:500;line-height:18px;text-decoration:none;white-space:nowrap;cursor:pointer}.dcp-project-links a:hover,.dcp-project-links button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff0a);color:var(--dsw-alias-label-primary,inherit)}.dcp-project-links a:focus-visible,.dcp-project-links button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f8cff);outline-offset:2px}.dcp-project-links svg{display:block;flex:none;width:16px;height:16px}`}</style>
      <header className="dcp-project-head">
        <h1>
          {zh ? "悬浮宠物" : "Floating pet"}
          <span className="dcp-version">v{__PET_VERSION__}</span>
        </h1>
        <nav className="dcp-project-links">
          <a
            href="https://github.com/Very12345/dsh-codex-pet"
            target="_blank"
            rel="noreferrer"
          >
            <GithubMark16 />
            GitHub
          </a>
          <a
            href="https://github.com/Very12345/dsh-codex-pet/issues"
            target="_blank"
            rel="noreferrer"
          >
            <FeedbackMark16 />
            {zh ? "问题反馈" : "Issues"}
          </a>
        </nav>
      </header>
    </>
  );
}
