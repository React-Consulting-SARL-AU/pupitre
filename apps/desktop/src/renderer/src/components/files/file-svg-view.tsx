import type { FsStatResult } from "@pupitre/shared/agent-protocol/files";
import { useTranslations } from "@renderer/i18n/use-translations";
import { nameOf } from "@renderer/lib/files";
import { type ShotSize, shotSize } from "@renderer/lib/shot-image";
import { useEffect, useState } from "react";
import { FileSheet } from "./file-sheet";

interface Drawing {
  url: string;
  size: ShotSize | null;
}

export function FileSvgView({
  path,
  text,
  stat,
}: {
  path: string;
  text: string;
  stat: FsStatResult;
}) {
  const t = useTranslations();

  const [drawing, setDrawing] = useState<Drawing | null>(null);

  useEffect(() => {
    const blob = new Blob([text], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    let current = true;

    shotSize(blob).then((size) => {
      if (current) {
        setDrawing({ size, url });
      }
    });

    return () => {
      current = false;
      URL.revokeObjectURL(url);
    };
  }, [text]);

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      {drawing ? (
        <img
          alt={t("files.preview.alt", { name: nameOf(path) })}
          className="max-h-[60vh] w-full rounded-md bg-sunken object-contain"
          height={drawing.size?.height}
          src={drawing.url}
          width={drawing.size?.width}
        />
      ) : null}
      <FileSheet stat={stat} />
    </div>
  );
}
