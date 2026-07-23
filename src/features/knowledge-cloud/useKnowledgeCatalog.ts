import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { KnowledgeAccount, KnowledgeBase } from "../../types";
import { knowledgeSessionChangedEvent } from "./integrationState";

export type KnowledgeCatalogState = {
  status: "loading" | "authenticated" | "anonymous" | "unavailable";
  account: KnowledgeAccount | null;
  csrfToken: string;
  bases: KnowledgeBase[];
  error: string;
};

const initialState: KnowledgeCatalogState = {
  status: "loading",
  account: null,
  csrfToken: "",
  bases: [],
  error: ""
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
        error: ""
      });
    } catch (error) {
      setState({
        ...initialState,
        status: "unavailable",
        error: error instanceof Error ? error.message : "知识库服务暂时不可用"
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onSessionChanged = (event: Event) => {
      const authenticated = (event as CustomEvent<{ authenticated?: boolean }>).detail?.authenticated;
      if (authenticated === false) {
        setState({ ...initialState, status: "anonymous" });
        return;
      }
      void refresh();
    };
    window.addEventListener(knowledgeSessionChangedEvent, onSessionChanged);
    return () => window.removeEventListener(knowledgeSessionChangedEvent, onSessionChanged);
  }, [refresh]);

  return { ...state, refresh };
}
