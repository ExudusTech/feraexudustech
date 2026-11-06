/** The official site is not live yet: hide it when empty or still the default placeholder. */
export function siteVisivel(site: string | null | undefined): boolean {
  const v = (site ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return !!v && v !== "www.nitsclean.com.br" && v !== "nitsclean.com.br";
}
