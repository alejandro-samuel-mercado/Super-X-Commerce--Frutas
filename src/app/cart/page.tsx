"use client";

import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import CartContent from "./CartContent";

export default function CartPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            }
        >
            <CartContentWithMount />
        </Suspense>
    );
}

function CartContentWithMount() {
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => setIsMounted(true), []);

    if (!isMounted) return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    );

    return <CartContent />;
}
