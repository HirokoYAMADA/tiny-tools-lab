import { Card, CardHeader, CardTitle } from "@/components/ui/card";

type MainMenuCardProps = {
    href?: string;
    title: string;
}

export function MainMenuCard({ href, title }: MainMenuCardProps) {
    return (
        // hrefがあればCardをリンクにし、なければCardをそのまま表示 
        <Card className="aspect-square w-40" {...(href && { href: href })}>
            <CardHeader>
                <CardTitle className="text-center">{title}</CardTitle>
            </CardHeader>
        </Card >
    );
}