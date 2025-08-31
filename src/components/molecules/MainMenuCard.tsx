import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type MainMenuCardProps = {
    href?: string;
    title: string;
    children: React.ReactNode;
}

export function MainMenuCard({ href, title, children }: MainMenuCardProps) {
    return (
        // hrefがあればCardをリンクにし、なければCardをそのまま表示 
        <Card className="aspect-square w-40" {...(href && { href: href })}>
            <CardHeader>
                <CardTitle className="text-center font-medium text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center items-center">
                {children}
            </CardContent>
        </Card >
    );
}