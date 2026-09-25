import { useState, useEffect, useRef, useCallback } from "react";
import { useJobStore } from "@/stores/jobStore";

interface UseJobSearchResult {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  resultCount: number;
}

export function useJobSearch(): UseJobSearchResult {
  const { jobs, filters, setFilters } = useJobStore();
  const [searchQuery, setSearchQuery] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSetFilter = useCallback(
    (query: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        setFilters({ search: query });
      }, 300);
    },
    [setFilters]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleSetSearchQuery = useCallback(
    (query: string) => {
      setSearchQuery(query);
      debouncedSetFilter(query);
    },
    [debouncedSetFilter]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setFilters({ search: "" });
  }, [setFilters]);

  return {
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    clearSearch,
    resultCount: jobs.length,
  };
}
