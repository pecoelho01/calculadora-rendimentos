import { useState } from "react";

export type SortDirection = "asc" | "desc";

export type TableSort<Sort extends string> = {
  sort: Sort;
  direction: SortDirection;
  selectSort: (next: Sort) => void;
  changeSort: (next: Sort) => void;
  toggleDirection: () => void;
};

export function useTableSort<Sort extends string>(
  initialSort: Sort,
  defaultDirections: Record<Sort, SortDirection>,
): TableSort<Sort> {
  const [sort, setSort] = useState(initialSort);
  const [direction, setDirection] = useState<SortDirection>(
    defaultDirections[initialSort],
  );

  function toggleDirection() {
    setDirection(direction === "asc" ? "desc" : "asc");
  }

  function selectSort(next: Sort) {
    setSort(next);
    setDirection(defaultDirections[next]);
  }

  function changeSort(next: Sort) {
    if (sort === next) {
      toggleDirection();
      return;
    }

    selectSort(next);
  }

  return { sort, direction, selectSort, changeSort, toggleDirection };
}
