import { useState } from 'react';

export function usePagination(totalItems: number, pageSize: number = 20) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const offset = (currentPage - 1) * pageSize;
  const canGoNext = currentPage < totalPages;
  const canGoPrev = currentPage > 1;

  const goToPage = (n: number) => {
    const clamped = Math.max(1, Math.min(n, totalPages));
    setCurrentPage(clamped);
  };

  const nextPage = () => { if (canGoNext) setCurrentPage((p) => p + 1); };
  const prevPage = () => { if (canGoPrev) setCurrentPage((p) => p - 1); };

  return { currentPage, totalPages, goToPage, nextPage, prevPage, offset, canGoNext, canGoPrev };
}
