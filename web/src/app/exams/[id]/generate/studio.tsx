"use client";

import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GenerationProgress } from "./progress";
import {
  acceptDrafts,
  generateFromFile,
  regenerateDraft,
  type GenerateState,
} from "./actions";
import type { DraftQuestion } from "@/lib/ai/gemini";

const field =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const label = "block text-sm font-medium text-slate-700 dark:text-slate-300";
const button =
  "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md";

export function GenerateStudio({ examId }: { examId: string }) {
  const supabase = useRef(createClient());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ path: string; name: string } | null>(null);

  // One id per mounted studio; the action upserts against it and deletes it
  // when the run ends, so reusing it across runs is fine.
  const [runId] = useState(() => crypto.randomUUID());

  const [genState, generate, generating] = useActionState<GenerateState, FormData>(
    generateFromFile,
    {},
  );
  const [acceptState, accept, accepting] = useActionState<GenerateState, FormData>(
    acceptDrafts,
    {},
  );
  const [regenState, regenerate, regenerating] = useActionState<GenerateState, FormData>(
    regenerateDraft,
    {},
  );
  const [dragging, setDragging] = useState(false);

  // Local copy so the instructor can edit and drop drafts before committing them.
  const [drafts, setDrafts] = useState<DraftQuestion[] | null>(null);
  const shown = drafts ?? genState.drafts ?? null;
  if (genState.drafts && drafts === null) setDrafts(genState.drafts);

  // A regenerate returns the whole edited list back with one item swapped.
  const regenSeen = useRef<GenerateState | null>(null);
  if (regenState.drafts && regenState !== regenSeen.current) {
    regenSeen.current = regenState;
    setDrafts(regenState.drafts);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  }

  async function uploadFile(file: File) {
    setUploadError(null);
    setUploading(true);
    setDrafts(null);

    // Straight to Storage from the browser — a serverless request body would cap
    // this far lower than the bucket's 20 MB.
    const path = `${examId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.current.storage
      .from("lesson-files")
      .upload(path, file, { upsert: false });

    setUploading(false);
    if (error) {
      setUploadError(error.message);
      return;
    }
    setUploaded({ path, name: file.name });
  }

  function updateDraft(i: number, patch: Partial<DraftQuestion>) {
    setDrafts((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      copy[i] = { ...copy[i], ...patch };
      return copy;
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">
          1 · Upload lesson material
        </h2>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          Deleted as soon as its text has been read — only the text is kept, and
          only so you can generate more without uploading again.
          PDF, DOCX, PPTX, TXT or MD, up to 20 MB. A scanned PDF has no text layer
          and won&apos;t work without OCR.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void uploadFile(file);
          }}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition ${
            dragging
              ? "border-slate-900 bg-slate-50 dark:border-slate-300 dark:bg-slate-800"
              : "border-slate-300 dark:border-slate-700"
          }`}
        >
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            Drag a lesson file here, or choose one:
          </p>
          <input
            type="file"
            accept={ACCEPT}
            onChange={onFile}
            disabled={uploading}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700 dark:text-slate-400 dark:file:bg-slate-100 dark:file:text-slate-900"
          />
        </div>

        {uploading ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Uploading…</p>
        ) : null}
        {uploadError ? (
          <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
            {uploadError}
          </p>
        ) : null}
        {uploaded ? (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
            Ready: {uploaded.name}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">
          2 · Generate drafts
        </h2>
        <form action={generate} className="mt-4 space-y-4">
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="storagePath" value={uploaded?.path ?? ""} />
          <input type="hidden" name="filename" value={uploaded?.name ?? ""} />
          <input type="hidden" name="runId" value={runId} />

          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ask for as many as you need. Large orders are split into several
            requests and merged, so they take longer — and repeats between
            requests are dropped, which can leave you a few short. Generate
            again for the rest.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="mcCount" className={label}>
                Multiple-choice items
              </label>
              <input
                id="mcCount"
                name="mcCount"
                type="number"
                min={0}
                defaultValue={5}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="identCount" className={label}>
                Identification items
              </label>
              <input
                id="identCount"
                name="identCount"
                type="number"
                min={0}
                defaultValue={2}
                className={field}
              />
            </div>
          </div>

          {genState.error ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {genState.error}
            </p>
          ) : null}
          {genState.notice ? (
            <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
              {genState.notice}
            </p>
          ) : null}

          {generating ? (
            <GenerationProgress runId={runId} />
          ) : (
            <button type="submit" disabled={!uploaded} className={button}>
              Generate drafts
            </button>
          )}
        </form>
      </section>

      {shown?.length ? (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-6 dark:border-slate-800">
            <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">
              3 · Review before adding
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Nothing is added to the exam until you accept it. Edit anything that
              reads badly, regenerate a weak item, or drop it entirely.
            </p>
            {regenState.error ? (
              <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                {regenState.error}
              </p>
            ) : null}
          </div>

          <ul>
            {shown.map((d, i) => (
              <li key={i} className="space-y-3 border-b border-slate-100 p-6 last:border-0 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {d.type.replace("_", " ").toLowerCase()}
                  </span>
                  <span className="flex shrink-0 gap-4">
                    <form action={regenerate}>
                      <input type="hidden" name="examId" value={examId} />
                      <input type="hidden" name="index" value={i} />
                      <input type="hidden" name="type" value={d.type} />
                      <input type="hidden" name="drafts" value={JSON.stringify(shown)} />
                      <button
                        type="submit"
                        disabled={regenerating}
                        className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        {regenerating ? "…" : "Regenerate"}
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => setDrafts((p) => (p ?? []).filter((_, j) => j !== i))}
                      className="text-sm text-slate-500 underline underline-offset-4 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                    >
                      Drop
                    </button>
                  </span>
                </div>

                <textarea
                  value={d.prompt}
                  onChange={(e) => updateDraft(i, { prompt: e.target.value })}
                  rows={2}
                  className={field}
                  aria-label={`Question ${i + 1}`}
                />

                {d.type === "MULTIPLE_CHOICE" ? (
                  <div className="space-y-2">
                    {(d.choices ?? []).map((c, ci) => (
                      <label
                        key={ci}
                        className="flex items-center gap-3 text-sm text-slate-800 dark:text-slate-200"
                      >
                        <input
                          type="radio"
                          name={`correct-${i}`}
                          checked={d.answer === c}
                          onChange={() => updateDraft(i, { answer: c })}
                        />
                        <input
                          value={c}
                          onChange={(e) => {
                            const choices = [...(d.choices ?? [])];
                            const wasCorrect = d.answer === choices[ci];
                            choices[ci] = e.target.value;
                            updateDraft(i, {
                              choices,
                              ...(wasCorrect ? { answer: e.target.value } : {}),
                            });
                          }}
                          className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </label>
                    ))}
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      The selected radio is the correct answer.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className={label}>Expected answer</label>
                    <input
                      value={d.answer}
                      onChange={(e) => updateDraft(i, { answer: e.target.value })}
                      className={field}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-200 p-6 dark:border-slate-800">
            <form action={accept}>
              <input type="hidden" name="examId" value={examId} />
              <input type="hidden" name="drafts" value={JSON.stringify(shown)} />
              {acceptState.error ? (
                <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
                  {acceptState.error}
                </p>
              ) : null}
              {acceptState.notice ? (
                <p role="status" className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">
                  {acceptState.notice}
                </p>
              ) : null}
              <button type="submit" disabled={accepting} className={button}>
                {accepting ? "Adding…" : `Add ${shown.length} question${shown.length === 1 ? "" : "s"} to exam`}
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
