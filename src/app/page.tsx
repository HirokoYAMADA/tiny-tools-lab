import { MainMenuCard } from "@/components/molecules/MainMenuCard";

export default function Home() {
  return (
    <div>
      {/* タイトル */}
      <h1>Welcome to Tiny Tools Lab</h1>
      {/* ツール一覧 */}
      <div className="flex flex-wrap gap-4 justify-center ">
        <MainMenuCard href="/as_far_as_possible" title="遠くに行きたい" />
        <MainMenuCard title="工事中" />
      </div>
    </div>
  );
}
