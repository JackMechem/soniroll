import FileViewPage from "@/components/files/FileViewPage";

export const metadata = { title: "File" };

/** `/files/view?kind=…&id=…` — one of your own files on its own (the side view and split screen
    show it beside other pages). */
export default async function FileViewRoute({ searchParams }: { searchParams: Promise<{ kind?: string; id?: string }> }) {
  const { kind, id } = await searchParams;
  return <FileViewPage kind={kind ?? "file"} id={id ?? ""} />;
}
