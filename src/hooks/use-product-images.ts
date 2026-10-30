import { useQuery } from "@tanstack/react-query";
import { signProductImages } from "@/lib/product-images";

export function useProductImageUrls(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: ["product-image-urls", list],
    queryFn: () => signProductImages(list),
    enabled: list.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}
