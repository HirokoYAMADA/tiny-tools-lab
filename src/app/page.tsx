import { MapRouteIcon } from "@/components/atoms/MapRouteIcon";
import { ConstructionIcon } from "@/components/atoms/ConstructionIcon";
import { MainMenuCard } from "@/components/molecules/MainMenuCard";

export default function Home() {
  return (
    <div className="w-full">
      {/* タイトル */}
      <div className="">
        <h1 className="text-2xl font-bold text-center py-10">Welcome to Tiny Tools Lab</h1>
      </div>

      {/* ツール一覧 */}
      <div className="flex flex-wrap gap-4 justify-center px-4">
        <MainMenuCard href="/as_far_as_possible" title="遠くに行きたい" ><MapRouteIcon className="w-14 h-14" /></MainMenuCard>
        <MainMenuCard title="工事中" ><ConstructionIcon className="w-14 h-14" /></MainMenuCard>
        <MainMenuCard title="工事中" ><ConstructionIcon className="w-14 h-14" /></MainMenuCard>
      </div>
    </div>
  );
}
