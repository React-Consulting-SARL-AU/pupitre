import {
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  SearchQuery,
  selectMatches,
  setSearchQuery,
} from "@codemirror/search";
import { runScopeHandlers } from "@codemirror/view";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { SearchPanelHandle } from "@renderer/lib/editor-search";
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Regex,
  Replace,
  ReplaceAll,
  Search,
  TextSelect,
  WholeWord,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { Button } from "../ui/button";
import { fieldControlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";
import { FileSearchCount } from "./file-search-count";

const INPUT = `${fieldControlClass} py-1 text-[12px]`;

type QueryPatch = Partial<
  Pick<
    SearchQuery,
    "search" | "replace" | "caseSensitive" | "regexp" | "wholeWord"
  >
>;

/**
 * The search and replace of the open file, over the editor's own query.
 *
 * The panel holds no state of its own: the query lives in the editor, the
 * count is read from its text and its cursor, and the fields dispatch every
 * keystroke back. Enter walks the matches, Escape hands the focus back to
 * the text, and the three switches — case, expression, whole word — read as
 * pressed when they are on.
 */
export function FileSearchPanel({ panel }: { panel: SearchPanelHandle }) {
  const t = useTranslations();
  const { query, matches } = useSyncExternalStore(panel.subscribe, panel.read);
  const { view } = panel;

  const searchField = useRef<HTMLInputElement | null>(null);
  const replaceField = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchField.current?.focus();
    searchField.current?.select();
  }, []);

  const none = matches.total === 0;

  function set(patch: QueryPatch): void {
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          caseSensitive: query.caseSensitive,
          regexp: query.regexp,
          replace: query.replace,
          search: query.search,
          wholeWord: query.wholeWord,
          ...patch,
        })
      ),
    });
  }

  function keyHandler(onEnter: (shift: boolean) => void) {
    return (event: KeyboardEvent<HTMLInputElement>): void => {
      if (runScopeHandlers(view, event.nativeEvent, "search-panel")) {
        event.preventDefault();
      } else if (event.key === "Enter") {
        event.preventDefault();
        onEnter(event.shiftKey);
      }
    };
  }

  const onSearchKey = keyHandler((shift) =>
    (shift ? findPrevious : findNext)(view)
  );
  const onReplaceKey = keyHandler(() => replaceNext(view));

  return (
    <search
      aria-label={t("files.search.label")}
      className="flex flex-col gap-1.5 px-2 py-1.5"
      data-search-panel="true"
    >
      <div className="flex items-center gap-1.5">
        <label className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-4"
            size={12}
            strokeWidth={1.5}
          />
          <input
            aria-label={t("files.search.label")}
            className={`${INPUT} pl-7`}
            main-field="true"
            name="search"
            onChange={(event) => set({ search: event.target.value })}
            onKeyDown={onSearchKey}
            placeholder={t("files.search.label")}
            ref={searchField}
            spellCheck={false}
            type="text"
            value={query.search}
          />
        </label>

        <FileSearchCount matches={matches} query={query} />

        <IconButton
          icon={CaseSensitive}
          label={t("files.search.case")}
          onClick={() => set({ caseSensitive: !query.caseSensitive })}
          pressed={query.caseSensitive}
          size={12}
        />
        <IconButton
          icon={WholeWord}
          label={t("files.search.word")}
          onClick={() => set({ wholeWord: !query.wholeWord })}
          pressed={query.wholeWord}
          size={12}
        />
        <IconButton
          icon={Regex}
          label={t("files.search.regexp")}
          onClick={() => set({ regexp: !query.regexp })}
          pressed={query.regexp}
          size={12}
        />

        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line" />

        <IconButton
          disabled={none}
          icon={ChevronUp}
          label={t("files.search.previous")}
          onClick={() => findPrevious(view)}
          size={12}
        />
        <IconButton
          disabled={none}
          icon={ChevronDown}
          label={t("files.search.next")}
          onClick={() => findNext(view)}
          size={12}
        />
        <IconButton
          disabled={none}
          icon={TextSelect}
          label={t("files.search.selectAll")}
          onClick={() => selectMatches(view)}
          size={12}
        />
        <IconButton
          icon={X}
          label={t("files.search.close")}
          onClick={() => closeSearchPanel(view)}
          size={12}
          variant="discreet"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <label className="relative min-w-0 flex-1">
          <Replace
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-4"
            size={12}
            strokeWidth={1.5}
          />
          <input
            aria-label={t("files.search.replace")}
            className={`${INPUT} pl-7`}
            name="replace"
            onChange={(event) => set({ replace: event.target.value })}
            onKeyDown={onReplaceKey}
            placeholder={t("files.search.replace")}
            ref={replaceField}
            spellCheck={false}
            type="text"
            value={query.replace}
          />
        </label>

        <Button
          disabled={none}
          icon={Replace}
          onClick={() => replaceNext(view)}
          size="sm"
        >
          {t("files.search.replaceOne")}
        </Button>
        <Button
          disabled={none}
          icon={ReplaceAll}
          onClick={() => replaceAll(view)}
          size="sm"
        >
          {t("files.search.replaceAll")}
        </Button>
      </div>
    </search>
  );
}
