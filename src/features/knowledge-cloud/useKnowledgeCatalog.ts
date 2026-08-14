import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { KnowledgeAccount, KnowledgeBase } from "../../types";
import {
  knowledgeChatIssue,
  knowledgeSessionChangedEvent,
  type KnowledgeSessionChangeReason
} from "./integrationState";

export type KnowledgeCatalogStatus =
  | "loading"
  | "authenticated"
  | "anonymous"
  | "unavailable";

export type KnowledgeCatalogState = {
  status: KnowledgeCatalogStatus;
  account: KnowledgeAccount | null;
  csrfToken: string;
  bases: KnowledgeBase[];
  error: string;
  sessionExpired: boolean;
};

const initialState: KnowledgeCatalogState = {
  status: "loading",
  account: null,
  csrfToken: "",
  bases: [],
  error: "",
  sessionExpired: false
};

export function useKnowledgeCatalog() {
  const [state, setState] = useState<KnowledgeCatalogState>(initialState);

  const refresh = useCallback(async () => {
    try {
      const session = await api.knowledgeSession();
      if (!session.authenticated || !session.account) {
        setState({ ...initialState, status: "anonymous" });
        return;
      }
      const response = await api.knowledgeBases();
      setState({
        status: "authenticated",
        account: session.account,
        csrfToken: session.csrfToken || "",
        bases: response.items,
        error: "",
        sessionExpired: false
      });
    } catch (error) {
      const issue = knowledgeChatIssue(error);
      setState({
        ...initialState,
        status: issue.kind === "session-expired" ? "anonymous" : "unavailable",
        error: issue.message,
        sessionExpired: issue.kind === "session-expired"
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onSessionChanged = (event: Event) => {
      const detail = (event as CustomEvent<{
        authenticated?: boolean;
        reason?: KnowledgeSessionChangeReason;
      }>).detail;
      const authenticated = detail?.authenticated;
      if (authenticated === false) {
        setState({
          ...initialState,
          status: "anonymous",
          sessionExpired: detail?.reason === "expired"
        });
        return;
      }
      void refresh();
    };
    window.addEventListener(knowledgeSessionChangedEvent, onSessionChanged);
    return () => window.removeEventListener(knowledgeSessionChangedEvent, onSessionChanged);
  }, [refresh]);

  return { ...state, refresh };
}
