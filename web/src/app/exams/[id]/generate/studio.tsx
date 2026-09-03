"use client";

import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { acceptDrafts, generateFromFile, type GenerateState } from "./actions";
import type { DraftQuestion } from "@/lib/ai/gemini";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const button =
  "rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md";

export function GenerateStudio({ examId }: { examId: string }) {
  const supabase = useRef(createClient());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ path: string; name: string } | null>(null);

  const [genState, generate, generating] = useActionState<GenerateState, FormData>(
    generateFromFile,
    {},
  );
  const [acceptState, accept, accepting] = useActionState<GenerateState, FormData>(
    acceptDrafts,
    {},
  );

  // Local copy so the instructor can edit and drop drafts before committing them.
  const [drafts, setDrafts] = useState<DraftQuestion[] | null>(null);
  const shown = drafts ?? genState.drafts ?? null;
  if (genState.drafts && drafts === null) setDrafts(genState.drafts);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
          1 · Upload lesson material
        </h2>
        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
          PDF, DOCX, PPTX, TXT or MD, up to 20 MB. A scanned PDF has no text layer
          and won&apos;t work without OCR.
        </p>

        <input
          type="file"
          accept={ACCEPT}
          onChange={onFile}
          disabled={uploading}
          className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-700 dark:text-gray-400 dark:file:bg-gray-100 dark:file:text-gray-900"
        />

        {uploading ? (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Uploading…</p>
        ) : null}
        {uploadError ? (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {uploadError}
          </p>
        ) : null}
        {uploaded ? (
          <p className="mt-3 text-sm text-green-700 dark:text-green-400">
            Ready: {uploaded.name}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
          2 · Generate drafts
        </h2>
        <form action={generate} className="mt-4 space-y-4">
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="storagePath" value={uploaded?.path ?? ""} />
          <input type="hidden" name="filename" value={uploaded?.name ?? ""} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="count" className={label}>How many questions</label>
              <input
                id="count"
                name="count"
                type="number"
                min={1}
                max={20}
                defaultValue={5}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="mix" className={label}>Type mix</label>
              <select id="mix" name="mix" className={field} defaultValue="a mix of multiple choice and identification">
                <option value="a mix of multiple choice and identification">Mixed</option>
                <option value="all multiple choice">Multiple choice only</option>
                <option value="all identification">Identification only</option>
              </select>
            </div>
          </div>

          {genState.error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {genState.error}
            </p>
          ) : null}
          {genState.notice ? (
            <p role="status" className="text-sm text-green-700 dark:text-green-400">
              {genState.notice}
            </p>
          ) : null}

          <button type="submit" disabled={!uploaded || generating} className={button}>
            {generating ? "Generating… this can take a moment" : "Generate drafts"}
          </button>
        </form>
      </section>

      {shown?.length ? (
        <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 p-6 dark:border-gray-800">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
              3 · Review before adding
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Nothing is added to the exam until you accept it. Edit anything that
              reads badly, and drop anything wrong.
            </p>
          </div>

          <ul>
            {shown.map((d, i) => (
              <li key={i} className="space-y-3 border-b border-gray-100 p-6 last:border-0 dark:border-gray-800">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {d.type.replace("_", " ").toLowerCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDrafts((p) => (p ?? []).filter((_, j) => j !== i))}
                    className="text-sm text-gray-500 underline underline-offset-4 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                  >
                    Drop
                  </button>
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
                        className="flex items-center gap-3 text-sm text-gray-800 dark:text-gray-200"
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
                          className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
                        />
                      </label>
                    ))}
                    <p className="text-xs text-gray-400 dark:text-gray-500">
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

          <div className="border-t border-gray-200 p-6 dark:border-gray-800">
            <form action={accept}>
              <input type="hidden" name="examId" value={examId} />
              <input type="hidden" name="drafts" value={JSON.stringify(shown)} />
              {acceptState.error ? (
                <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                  {acceptState.error}
                </p>
              ) : null}
              {acceptState.notice ? (
                <p role="status" className="mb-3 text-sm text-green-700 dark:text-green-400">
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
