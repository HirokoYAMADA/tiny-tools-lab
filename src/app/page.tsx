import Image from "next/image";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div>
      {/* タイトル */}
      <h1>Welcome to Tiny Tools Lab</h1>
      {/* ツール一覧 */}
      <div>
        <Card href="/as_far_as_possible" className="w-30 max-w-sm">
          <CardHeader>
            <CardTitle>遠くに行きたい</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
