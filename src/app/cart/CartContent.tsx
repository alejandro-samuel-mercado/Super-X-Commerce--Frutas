"use client";

import { cart as cartContent } from "@/../content/cart";
import { http } from "@/adapters/http";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
      Dialog,
      DialogContent,
      DialogDescription,
      DialogFooter,
      DialogHeader,
      DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
      Select,
      SelectContent,
      SelectItem,
      SelectTrigger,
      SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { getIdempotencyKey } from "@/lib/idempotency";
import { formatPrice } from "@/lib/utils";
import { Branch, branchService } from "@/services/branch";
import { PublicConfig, configService } from "@/services/config";
import {
      OrderPreviewRequest,
      OrderPreviewResponse,
      orderService,
} from "@/services/orders";
import { PaymentGatewayOption, paymentService } from "@/services/payment";
import { ShippingZone, shippingService } from "@/services/shipping";
import { useCartStore } from "@/store/cart";
import { useCurrencyStore } from "@/store/currency";
import { useMutation } from "@tanstack/react-query";
import {
      AlertCircle,
      Award,
      Check,
      CheckCircle2,
      Loader2,
      MapPin,
      Minus,
      Plus,
      QrCode,
      ShieldCheck,
      Tag,
      Trash2,
      Truck,
      Upload,
      User,
} from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Step = "cart" | "data" | "delivery" | "payment";

interface CustomerData {
    email: string;
    name: string;
    phone: string;
    city: string;
    zipCode: string;
    address: string;
    dni: string;
    status: string;
    country: string;
    profileImage: string;
    state: string;
    points: number;
}

interface DeliveryData {
    method: "pickup" | "shipping";
    pickupBranchId?: string;
    shippingAddress?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        notes?: string;
        discountDetails?: {
            code: string;
            type: string;
            value: number;
            amount: number;
        };
        appliedDiscounts?: Array<{
            id: number;
            name: string;
            type: string;
            val: number;
            discountAmount: number;
        }>;
    };
}

export default function CartContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        console.log("[CartContent] Mounted");
    }, []);

    useEffect(() => {
        if (
            typeof window !== "undefined" &&
            searchParams.get("reloaded") !== "true"
        ) {
            const params = new URLSearchParams(window.location.search);
            params.set("reloaded", "true");
            window.location.replace(
                `${window.location.pathname}?${params.toString()}`,
            );
        }
    }, [searchParams]);

    const { user, isLoading: isAuthLoading } = useAuth();

    const items = useCartStore((state) => state.items);
    const updateQuantity = useCartStore((state) => state.updateQuantity);
    const removeItem = useCartStore((state) => state.removeItem);
    const clearCart = useCartStore((state) => state.clearCart);
    const addItem = useCartStore((state) => state.addItem);

    const clientSubtotal = items.reduce(
        (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
        0,
    );

    const { currency } = useCurrencyStore();

    const [currentStep, setCurrentStep] = useState<Step>("cart");
    const [couponCode, setCouponCode] = useState("");
    const [pointsToUse, setPointsToUse] = useState<number>(0);
    const [appliedPoints, setAppliedPoints] = useState<number>(0);
    const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);

    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [lugarNumero, setLugarNumero] = useState<number | null>(null);
    const [whatsappCoordination, setWhatsappCoordination] = useState("");
    const [qrPaymentProof, setQrPaymentProof] = useState<File | null>(null);
    const [qrPaymentProofPreview, setQrPaymentProofPreview] = useState<string | null>(null);
    const [isUploadingProof, setIsUploadingProof] = useState(false);
    const qrFileInputRef = useRef<HTMLInputElement>(null);
    const [deliveryData, setDeliveryData] = useState<DeliveryData>({
        method: "pickup",
    });
    const [preview, setPreview] = useState<OrderPreviewResponse>({
        subtotal: clientSubtotal,
        discount: 0,
        shipping: 0,
        tax: 0,
        total: clientSubtotal,
        paymentType: "MERCADO_PAGO",
        items: [],
        stockIssues: [],
    });
    const [lastNotifiedCoupon, setLastNotifiedCoupon] = useState<string | null>(
        null,
    );
    const [stockIssues, setStockIssues] = useState<any[]>([]);
    const hasStockError = useMemo(() => stockIssues.length > 0, [stockIssues]);

    const [customerData, setCustomerData] = useState<CustomerData>(() => {
        if (user) {
            return {
                email: user.email || "invitado@superx.com",
                name: user.name || "Cliente",
                phone: user.phone || "",
                city: user.city || "",
                zipCode: user.zipCode || "0000",
                address: user.address || "S/N",
                dni: user.dni || "00000000",
                status: user.status || "",
                country: user.country || "",
                profileImage: user.profileImage || "",
                state: user.state || "",
                points: user.points || 0,
            };
        }
        return {
            email: "invitado@superx.com",
            name: "Cliente",
            phone: "",
            city: "",
            zipCode: "0000",
            address: "S/N",
            dni: "00000000",
            status: "",
            country: "",
            profileImage: "",
            state: "",
            points: 0,
        };
    });
    const [createAccount, setCreateAccount] = useState(false);
    const [recentPendingOrder, setRecentPendingOrder] = useState<any>(null);

    const [nearestBranch, setNearestBranch] = useState<number | null>(null);
    const [showBypass, setShowBypass] = useState(false);
    const [bypassLoading, setBypassLoading] = useState(false);

    const [shippingZones, setShippingZones] = useState<ShippingZone[]>([]);
    const [storeConfig, setStoreConfig] = useState<PublicConfig | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);

    const [paymentOptions, setPaymentOptions] = useState<PaymentGatewayOption[]>(
        [],
    );
    const [selectedGateway, setSelectedGateway] = useState<string | null>(null);
    const [isPaymentLoading, setIsPaymentLoading] = useState(false);

    useEffect(() => {
        configService.getPublicConfig().then(setStoreConfig).catch(console.error);
        shippingService
            .getAvailableZones()
            .then((zones) => setShippingZones(zones))
            .catch(console.error);
        branchService
            .getAll()
            .then((data) => {
                if (Array.isArray(data)) {
                    setBranches(data.filter((b) => b.active || (b as any).isActive));
                } else {
                    setBranches([]);
                }
            })
            .catch(() => setBranches([]));
    }, []);

    useEffect(() => {
        if (storeConfig?.country && !customerData.country) {
            setCustomerData((prev) => ({
                ...prev,
                country: storeConfig.country,
            }));
        }
    }, [storeConfig?.country, customerData.country]);

    useEffect(() => {
        if (shippingZones.length > 0 && customerData.city && customerData.state) {
            const matchingZone = shippingZones.find(
                (z) =>
                    z.city?.toLowerCase() === customerData.city?.toLowerCase() &&
                    z.province?.toLowerCase() === customerData.state?.toLowerCase()
            );
            if (matchingZone) {
                setSelectedZoneId(String(matchingZone.id));
                setLugarNumero(matchingZone.cost);
            }
        }
    }, [shippingZones, customerData.city, customerData.state]);

    useEffect(() => {
        if (user && items.length === 0 && currentStep === "cart") {
            orderService
                .getMySales({ includePending: true })
                .then((sales) => {
                    const pending = sales.find((s: any) => {
                        const isPending = s.paymentStatus === "PENDING";
                        const isRecent =
                            new Date().getTime() - new Date(s.createdAt).getTime() <
                            24 * 60 * 60 * 1000;
                        return isPending && isRecent;
                    });
                    if (pending) {
                        setRecentPendingOrder(pending);
                    }
                })
                .catch(console.error);
        }
    }, [user, items.length, currentStep]);

    const handleRecoverOrder = async () => {
        if (!recentPendingOrder) return;

        try {
            for (const item of recentPendingOrder.items) {
                const cartItem = {
                    productId: item.sku?.productId,
                    skuId: item.skuId.toString(),
                    productName: item.productName || item.sku?.product?.name,
                    price: Number(item.unitPrice),
                    productImage: item.sku?.product?.images?.[0] || "",
                    qty: Number(item.quantity),
                    attributes:
                        item.sku?.variantOptions?.reduce(
                            (acc: any, opt: any) => ({ ...acc, [opt.name]: opt.value }),
                            {},
                        ) || {},
                    stock: item.sku?.stock || 99,
                };
                await addItem(cartItem, !!user);
            }
            setRecentPendingOrder(null);
            toast.success("Carrito recuperado exitosamente");
        } catch (error) {
            toast.error("Error al recuperar el carrito");
        }
    };

    useEffect(() => {
        const fetchPaymentOptions = async () => {
            if (!currency) return;
            setIsPaymentLoading(true);
            try {
                // Fetch to satisfy backend, but ignore its options
                await paymentService.getPaymentOptions(currency);

                const allOptions: PaymentGatewayOption[] = [{
                    id: 9999,
                    name: 'Pago con QR',
                    slug: 'QR',
                    type: 'PRIMARY',
                    isFallback: true,
                }];

                setPaymentOptions(allOptions);

                if (allOptions.length > 0) {
                    const primary =
                        allOptions.find((o) => o.type === "PRIMARY") || allOptions[0];
                    setSelectedGateway(primary.slug);
                }
            } catch (error) {
                if (paymentOptions.length > 0) {
                    toast.error("Error al actualizar opciones de pago");
                }
            } finally {
                setIsPaymentLoading(false);
            }
        };

        fetchPaymentOptions();
    }, [currency, storeConfig]);

    const shippingMutation = useMutation({
        mutationFn: async (address: {
            city: string;
            state: string;
            zip: string;
            country?: string;
        }) => {
            return shippingService.calculateCost({
                ...address,
                items: items.map((item) => ({
                    skuId: String(item.skuId),
                    quantity: item.qty,
                })),
                subtotal: preview?.subtotal || clientSubtotal,
            });
        },
        onSuccess: (data) => {
            setPreview((prev) => {
                const newShipping = Number(data.cost);
                const newTotal =
                    (prev.subtotal || 0) -
                    (prev.discount || 0) -
                    (prev.pointsDiscount || 0) +
                    (prev.tax || 0) +
                    newShipping;
                return { ...prev, shipping: newShipping, total: Math.max(0, newTotal) };
            });
        },
        onError: () => {
            toast.error(cartContent.errors.shipping);
        },
    });

    useEffect(() => {
        if (
            deliveryData.method === "shipping" &&
            customerData.city &&
            customerData.state &&
            customerData.zipCode &&
            !selectedZoneId
        ) {
            shippingMutation.mutate({
                city: customerData.city,
                state: customerData.state,
                zip: customerData.zipCode,
                country: customerData.country,
            });
        }
    }, [
        deliveryData.method,
        customerData.city,
        customerData.state,
        customerData.zipCode,
        customerData.country,
        selectedZoneId,
    ]);

    const isAddressValid = useMemo(() => {
        if (!shippingZones || !Array.isArray(shippingZones) || shippingZones.length === 0) return true;
        if (!customerData.city) return true;

        return shippingZones.some(
            (z) =>
                (z.country || storeConfig?.country || "") === customerData.country &&
                z.province === customerData.state &&
                z.city === customerData.city,
        );
    }, [
        shippingZones,
        customerData.country,
        customerData.state,
        customerData.city,
        storeConfig?.country,
    ]);

    const debouncedItems = useDebounce(items, 150);

    // Prefiltrar datos del cliente si está autenticado
    useEffect(() => {
        if (user) {
            setCustomerData({
                email: user.email,
                name: user.name || "",
                phone: user.phone || "",
                city: user.city || "",
                zipCode: user.zipCode || "",
                address: user.address || "",
                dni: user.dni || "",
                status: user.status || "",
                country: user.country || "",
                profileImage: user.profileImage || "",
                state: user.state || "",
                points: user.points || 0,
            });

            setDeliveryData((prev) => ({
                ...prev,
                shippingAddress: {
                    street: user.address || "",
                    city: user.city || "",
                    state: user.state || "",
                    zip: user.zipCode || "",
                    notes: "",
                },
            }));
        }
    }, [user]);

    // Previsualización de la orden
    const previewMutation = useMutation({
        mutationFn: async () => {
            const payload: OrderPreviewRequest = {
                items: debouncedItems.map((item) => ({
                    skuId: String(item.skuId),
                    quantity: item.qty,
                })),
                couponCode: appliedCoupon || undefined,
                paymentType: selectedGateway as any,
                deliveryMethod: deliveryData.method,
                pointsToUse: appliedPoints,
                currencyCode: currency || undefined,
                userId: user?.id ? Number(user.id) : undefined,
                shippingCost: deliveryData.method === "shipping" ? (lugarNumero ?? undefined) : undefined,
            };

            if (deliveryData.method === "pickup" && deliveryData.pickupBranchId) {
                payload.branchId = deliveryData.pickupBranchId;
            } else if (deliveryData.method === "shipping") {
                payload.address = {
                    city: customerData.city,
                    state: customerData.state,
                    country: customerData.country,
                    zip: customerData.zipCode,
                };
            }

            return orderService.preview(payload);
        },
        onSuccess: (data) => {
            if (data && typeof data.subtotal === "number") {
                setPreview(data);

                // Si hay un cupón aplicado pero la previsualización devuelve un error para él
                if (appliedCoupon && data.discountDetails?.error) {
                    toast.error(data.discountDetails.error);
                    setAppliedCoupon(null);
                    setCouponCode("");
                    setLastNotifiedCoupon(null);
                } else if (
                    appliedCoupon &&
                    !data.discountDetails?.error &&
                    data.discountDetails?.code === appliedCoupon
                ) {
                    // Si el cupón se aplicó con éxito y no ha sido notificado aún
                    if (lastNotifiedCoupon !== appliedCoupon) {
                        toast.success(cartContent.step1.coupon.success);
                        setLastNotifiedCoupon(appliedCoupon);
                    }
                } else if (!appliedCoupon) {
                    setLastNotifiedCoupon(null);
                }
            }
            setStockIssues(data?.stockIssues || []);
        },
        onError: () => {
            toast.error(cartContent.errors.preview);
        },
    });

    // Sincronizar precios del carrito cuando cambie la moneda (Solo si hay usuario logueado)
    const syncWithBackend = useCartStore((state) => state.syncWithBackend);
    useEffect(() => {
        if (currency && user) {
            syncWithBackend(currency);
        }
    }, [currency, syncWithBackend, user]);

    const dependencyString = useMemo(() => {
        return JSON.stringify({
            items: debouncedItems.map((i) => ({ id: i.skuId, q: i.qty })),
            coupon: appliedCoupon,
            method: deliveryData.method,
            branchId:
                deliveryData.method === "pickup"
                    ? deliveryData.pickupBranchId
                    : undefined,
            points: appliedPoints,
            currency: currency,
            gateway: selectedGateway,
            address:
                deliveryData.method === "shipping"
                    ? {
                        city: customerData.city?.trim() || "",
                        state: customerData.state?.trim() || "",
                        zip: customerData.zipCode?.trim() || "",
                        country: customerData.country?.trim() || "",
                    }
                    : null,
            userId: user?.id,
            shippingCost: deliveryData.method === "shipping" ? lugarNumero : undefined,
        });
    }, [
        debouncedItems,
        appliedCoupon,
        deliveryData.method,
        deliveryData.pickupBranchId,
        appliedPoints,
        currency,
        selectedGateway,
        customerData.city,
        customerData.state,
        customerData.zipCode,
        customerData.country,
        user?.id,
        lugarNumero,
    ]);

    const prevDepsRef = useRef<string>("");

    useEffect(() => {
        if (
            items.length > 0 &&
            dependencyString !== prevDepsRef.current &&
            !previewMutation.isPending
        ) {
            prevDepsRef.current = dependencyString;
            previewMutation.mutate();
        }
    }, [dependencyString, user, previewMutation.isPending]);

    useEffect(() => {
        if (deliveryData.method === "pickup") {
            setPreview((prev) => ({
                ...prev,
                shipping: 0,
                total: Math.max(
                    0,
                    (prev.subtotal || 0) -
                    (prev.discount || 0) -
                    (prev.pointsDiscount || 0) +
                    (prev.tax || 0),
                ),
            }));
        }
    }, [deliveryData.method]);

    const couponMutation = useMutation({
        mutationFn: async (code: string) => {
            return orderService.validateCoupon(
                code,
                clientSubtotal,
                currency || undefined,
                user?.id ? Number(user.id) : undefined,
            );
        },
        onSuccess: (data) => {
            if (data.valid) {
                setAppliedCoupon(couponCode);
            } else {
                toast.error(data.message || cartContent.step1.coupon.invalid);
            }
        },
        onError: (error: any) => {
            const message =
                error?.response?.data?.message ||
                error?.message ||
                cartContent.errors.coupon;
            toast.error(message);
        },
    });

    const [isRedirecting, setIsRedirecting] = useState(false);

    const createOrderMutation = useMutation({
        mutationFn: async () => {
            const idempotencyKey = getIdempotencyKey();

            return orderService.create(
                {
                    items: items.map((item) => ({
                        skuId: item.skuId,
                        quantity: item.qty,
                    })),
                    customer: customerData,
                    deliveryMethod: deliveryData.method,
                    pickupBranchId: deliveryData.pickupBranchId,
                    deliveryAddress:
                        deliveryData.method === "shipping"
                            ? `${customerData.address}, ${customerData.city}, ${customerData.state}, ${customerData.zipCode}, ${customerData.country}`
                            : undefined,
                    address:
                        deliveryData.method === "shipping"
                            ? {
                                city: customerData.city,
                                state: customerData.state,
                                country: customerData.country,
                                zip: customerData.zipCode,
                            }
                            : undefined,
                    couponCode: appliedCoupon || undefined,
                    pointsToUse: appliedPoints,
                    createAccount,
                    paymentType: (selectedGateway as any) || "MERCADO_PAGO",
                    shippingCost: deliveryData.method === "shipping" ? (lugarNumero ?? undefined) : undefined,
                },
                idempotencyKey,
                { headers: { "x-silence-toast": "true" } },
            );
        },
        onError: (error: any) => {
            setIsRedirecting(false);
            const errorMessage = error?.message || cartContent.errors.create;
            toast.error(errorMessage);
        },
        onSuccess: async (data: any) => {
            clearCart();

            try {
                setIsRedirecting(true);

                const checkoutUrl = data.checkoutUrl;
                const saleId = data.id || data.saleId;
                const targetRef = data.uuid || data.id || data.saleId;

                if (selectedGateway === "QR" && saleId) {
                    if (qrPaymentProof) {
                        setIsUploadingProof(true);
                        const formData = new FormData();
                        formData.append("image", qrPaymentProof);
                        try {
                            await http(`/api/sales/${targetRef}/payment-proof`, {
                                method: "POST",
                                body: formData,
                            });
                            toast.success("Comprobante subido correctamente");
                        } catch (err: any) {
                            console.error("Error al subir comprobante:", err);
                            toast.error(err?.message || "Se creó la orden pero no se pudo subir el comprobante");
                        } finally {
                            setIsUploadingProof(false);
                        }
                    }
                    setShowSuccessDialog(true);
                    setIsRedirecting(false);
                    return;
                }

                if (checkoutUrl) {
                    window.location.href = checkoutUrl;
                } else if (saleId || data.uuid) {
                    setShowSuccessDialog(true);
                    setIsRedirecting(false);
                } else {
                    setShowSuccessDialog(true);
                    setIsRedirecting(false);
                }
            } catch (error) {
                setIsRedirecting(false);
            }
        },
    });

    const handleQuantityChange = (item: any, newQty: number) => {
        if (newQty <= 0) return;
        updateQuantity(item.skuId, newQty);
    };

    const handleApplyCoupon = () => {
        if (!couponCode.trim()) return;
        couponMutation.mutate(couponCode);
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCouponCode("");
    };

    const findNearestBranch = () => {
        if (!navigator.geolocation) {
            toast.error("La geolocalización no es compatible");
            return;
        }

        if (branches.length === 0) {
            toast.error("No hay sucursales disponibles");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;

                let nearest = branches[0];
                let minDistance = Infinity;

                branches.forEach((branch) => {
                    if (branch.latitude && branch.longitude) {
                        const distance = Math.sqrt(
                            Math.pow(Number(branch.latitude) - latitude, 2) +
                            Math.pow(Number(branch.longitude) - longitude, 2),
                        );

                        if (distance < minDistance) {
                            minDistance = distance;
                            nearest = branch;
                        }
                    }
                });

                setNearestBranch(nearest.id);
                setDeliveryData((prev) => ({
                    ...prev,
                    pickupBranchId: String(nearest.id),
                }));
                toast.success(`Sucursal más cercana: ${nearest.name}`);
            },
            () => {
                toast.error("No se pudo obtener tu ubicación");
            },
        );
    };

    const canProceed = () => {
        switch (currentStep) {
            case "cart":
                // Validación básica de carrito
                if (items.length === 0 || hasStockError) return false;

                // Validación de contacto
                if (!customerData.email || !customerData.name || !customerData.phone) return false;

                // Validación de entrega
                if (deliveryData.method === "pickup") {
                    if (!deliveryData.pickupBranchId) return false;
                    const availability = preview?.branchAvailability?.find(
                        (b) => String(b.branchId) === deliveryData.pickupBranchId,
                    );
                    return availability ? availability.isAvailable : true;
                } else if (deliveryData.method === "shipping") {
                    if (storeConfig && storeConfig.enableShipping === false) return false;
                    return (
                        !!customerData.address &&
                        !!customerData.city &&
                        !!customerData.state &&
                        !!customerData.zipCode &&
                        isAddressValid
                    );
                }
                return true;
            case "payment":
                return !!selectedGateway;
            default:
                return false;
        }
    };

    const handleNext = () => {
        if (currentStep === "cart") {
            const qrOption = paymentOptions.find(o => o.slug === 'QR');
            if (qrOption) {
                setSelectedGateway('QR');
            }
            setCurrentStep("payment");
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const handleBack = () => {
        if (currentStep === "payment") {
            setCurrentStep("cart");
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const isDebouncing = useMemo(() => {
        return JSON.stringify(items) !== JSON.stringify(debouncedItems);
    }, [items, debouncedItems]);

    const isUpdating =
        previewMutation.isPending ||
        shippingMutation.isPending ||
        couponMutation.isPending ||
        createOrderMutation.isPending;

    useEffect(() => {
        let timer: any;
        if (isUpdating) {
            timer = setTimeout(() => setShowBypass(true), 6000);
            console.log("[CartContent] isUpdating active:", {
                preview: previewMutation.isPending,
                shipping: shippingMutation.isPending,
                coupon: couponMutation.isPending,
                createOrder: createOrderMutation.isPending
            });
        } else {
            setShowBypass(false);
            setBypassLoading(false);
        }
        return () => clearTimeout(timer);
    }, [isUpdating, previewMutation.isPending, shippingMutation.isPending, couponMutation.isPending, createOrderMutation.isPending]);

    if (!isMounted) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    if (isAuthLoading) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </main>
        );
    }

    const handlePlaceOrder = () => {
        createOrderMutation.mutate();
    };

    if (items.length === 0 && currentStep === "cart") {
        return (
            <main className="min-h-screen py-16 pt-40 max:md:pt-20">
                <div className="container mx-auto px-4 text-center max-w-2xl">
                    <h1 className="text-3xl font-bold mb-4">
                        {cartContent.step1.emptyCart}
                    </h1>

                    {recentPendingOrder && (
                        <Card className="mb-8 p-6 bg-primary/5 border-primary/20 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex flex-col items-center gap-4">
                                <div className="p-3 bg-primary/10 rounded-full">
                                    <AlertCircle className="h-8 w-8 text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold mb-2">
                                        ¿Deseas recuperar tu carrito?
                                    </h2>
                                    <p className="text-muted-foreground mb-4">
                                        Tienes una orden pendiente de pago por{" "}
                                        <strong>{formatPrice(recentPendingOrder.total)}</strong>.
                                        Puedes recuperar los productos y continuar comprando.
                                    </p>
                                    <Button
                                        variant="default"
                                        className="w-full sm:w-auto"
                                        onClick={handleRecoverOrder}
                                    >
                                        Recuperar Productos
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}

                    <Button
                        className="border-border border-4"
                        variant="outline"
                        onClick={() => router.push("/products")}
                    >
                        {cartContent.step1.continueShopping}
                    </Button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen relative pb-40 md:pt-20  top-10 lg:pt-10">
            <div className="container mx-auto px-4 max-w-6xl md:p-20">
                <h1 className="text-4xl font-bold mb-10 text-center bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    {cartContent.title}
                </h1>


                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className={`${currentStep === "payment" ? "lg:col-span-3 max-w-2xl mx-auto w-full" : "lg:col-span-2"} space-y-6`}>
                        <Card className="p-6 md:p-8 rounded-[2rem] border-2 border-primary/40 bg-white/60 backdrop-blur-xl shadow-xl shadow-primary/5">
                            {/* Step 1: Carrito */}
                            {currentStep === "cart" && (
                                <div>
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent inline-block">
                                            {cartContent.step1.title}
                                        </h2>
                                        {isUpdating && (
                                            <div className="flex items-center gap-2 text-primary text-sm font-medium animate-pulse">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Actualizando...
                                            </div>
                                        )}
                                    </div>

                                    {hasStockError && (
                                        <div
                                            className={`mb-6 p-4 rounded-2xl flex items-start gap-4 animate-in fade-in slide-in-from-top-1 transition-all ${isUpdating ? "bg-amber-100 border border-amber-200" : "bg-destructive/10 border border-destructive/20"}`}
                                        >
                                            {isUpdating ? (
                                                <Loader2 className="h-6 w-6 text-amber-600 shrink-0 mt-0.5 animate-spin" />
                                            ) : (
                                                <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
                                            )}
                                            <div>
                                                <h4
                                                    className={`font-bold ${isUpdating ? "text-amber-800" : "text-destructive"}`}
                                                >
                                                    {isUpdating
                                                        ? "Validando cantidad..."
                                                        : "Stock Insuficiente"}
                                                </h4>
                                                <p
                                                    className={`text-sm ${isUpdating ? "text-amber-700/80" : "text-destructive/80"}`}
                                                >
                                                    {isUpdating
                                                        ? "Estamos comprobando la disponibilidad de stock..."
                                                        : `Algunos artículos en tu carrito no tienen stock suficiente ${deliveryData.method === "pickup" ? "en esta sucursal" : "para envío"}. Por favor, ajusta las cantidades para continuar.`}
                                                </p>
                                            </div>
                                        </div>
                                    )}



                                    <div
                                        className={`space-y-4 transition-opacity duration-300 ${isUpdating ? "opacity-60 pointer-events-none" : ""}`}
                                    >
                                        {items.map((item) => {
                                            const stockIssue = stockIssues.find(
                                                (s) => s.skuId === parseInt(item.skuId),
                                            );
                                            const previewItem = preview?.items?.find(
                                                (p) => p.skuId === parseInt(item.skuId),
                                            );
                                            const stockLimit = previewItem?.availableStock;

                                            return (
                                                <div
                                                    key={item.skuId}
                                                    className={`flex max-md:flex-col max-md:items-center gap-6 p-4 mb-4 rounded-xl border transition-all ${stockIssue
                                                            ? "bg-destructive/5 border-destructive/40 shadow-inner"
                                                            : "bg-secondary/20 border-white/60 shadow-sm hover:shadow-md"
                                                        }`}
                                                >
                                                    <div className="relative w-28 h-28 rounded-xl overflow-hidden shadow-inner flex-shrink-0">
                                                        <Image
                                                            src={item.productImage}
                                                            alt={item.productName}
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    </div>

                                                    <div className="flex-1 flex flex-col justify-between">
                                                        <div>
                                                            <h3 className="font-bold text-lg text-foreground">
                                                                {item.productName}
                                                            </h3>

                                                            {item.attributes &&
                                                                Object.keys(item.attributes).length > 0 && (
                                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                                        {Object.entries(item.attributes).map(
                                                                            ([key, value]) => (
                                                                                <div
                                                                                    key={key}
                                                                                    className="text-xs font-semibold px-2 py-1 bg-secondary/30 text-secondary-foreground rounded-md uppercase tracking-wider border border-secondary/40"
                                                                                >
                                                                                    {key}: {String(value)}
                                                                                </div>
                                                                            ),
                                                                        )}
                                                                    </div>
                                                                )}
                                                        </div>
                                                        <p className="font-bold text-xl text-primary mt-2">
                                                            {formatPrice(item.price, currency)}
                                                            {item.allowFractional && item.measurementUnit && (
                                                                <span className="text-xs font-normal text-muted-foreground ml-1">
                                                                    /
                                                                    {item.measurementUnit === "KG"
                                                                        ? "kg"
                                                                        : item.measurementUnit === "LITRO"
                                                                            ? "L"
                                                                            : item.measurementUnit === "METRO"
                                                                                ? "m"
                                                                                : item.measurementUnit.toLowerCase()}
                                                                </span>
                                                            )}
                                                        </p>
                                                        {stockIssue && (
                                                            <p className="text-xs font-bold text-destructive mt-1 flex items-center gap-1">
                                                                <AlertCircle className="h-3 w-3" />
                                                                Disponible:{" "}
                                                                {stockIssue.available.toFixed(
                                                                    item.allowFractional ? 3 : 0,
                                                                )}{" "}
                                                                {item.measurementUnit === "KG"
                                                                    ? "kg"
                                                                    : item.measurementUnit === "LITRO"
                                                                        ? "L"
                                                                        : item.measurementUnit === "METRO"
                                                                            ? "m"
                                                                            : "unit."}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col items-end justify-between gap-4">
                                                        {item.allowFractional ? (
                                                            <div className="flex items-center gap-2 bg-white/40 backdrop-blur-sm p-1.5 rounded-2xl border border-white/60">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-9 w-9 rounded-xl hover:bg-white/60 text-primary"
                                                                    onClick={() => {
                                                                        const step =
                                                                            item.measurementUnit === "KG"
                                                                                ? 0.1
                                                                                : item.measurementUnit === "LITRO"
                                                                                    ? 0.25
                                                                                    : 0.5;
                                                                        const newVal = Math.max(
                                                                            step,
                                                                            parseFloat(
                                                                                (Number(item.qty) - step).toFixed(3),
                                                                            ),
                                                                        );
                                                                        handleQuantityChange(item, newVal);
                                                                    }}
                                                                >
                                                                    <Minus className="h-4 w-4" />
                                                                </Button>
                                                                <input
                                                                    key={`input-${item.skuId}-${item.qty}`}
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    defaultValue={item.qty}
                                                                    onBlur={(e) => {
                                                                        const v = parseFloat(
                                                                            e.target.value.replace(",", "."),
                                                                        );
                                                                        if (!isNaN(v) && v > 0) {
                                                                            handleQuantityChange(item, v);
                                                                        } else {
                                                                            e.target.value = String(item.qty);
                                                                        }
                                                                    }}
                                                                    className="w-14 text-center font-bold text-lg text-primary bg-transparent outline-none"
                                                                />
                                                                <span className="text-xs font-bold text-muted-foreground uppercase pr-2">
                                                                    {item.measurementUnit === "KG"
                                                                        ? "kg"
                                                                        : item.measurementUnit === "LITRO"
                                                                            ? "L"
                                                                            : item.measurementUnit === "METRO"
                                                                                ? "m"
                                                                                : (item.measurementUnit?.toLowerCase() ??
                                                                                    "u")}
                                                                </span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-9 w-9 rounded-xl hover:bg-white/60 text-primary"
                                                                    onClick={() => {
                                                                        const step =
                                                                            item.measurementUnit === "KG"
                                                                                ? 0.1
                                                                                : item.measurementUnit === "LITRO"
                                                                                    ? 0.25
                                                                                    : 0.5;
                                                                        const maxVal = stockLimit ?? 9999;
                                                                        const newVal = Math.min(
                                                                            maxVal,
                                                                            parseFloat(
                                                                                (Number(item.qty) + step).toFixed(3),
                                                                            ),
                                                                        );
                                                                        handleQuantityChange(item, newVal);
                                                                    }}
                                                                    disabled={
                                                                        stockLimit !== undefined &&
                                                                        item.qty >= stockLimit
                                                                    }
                                                                >
                                                                    <Plus className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-4 bg-white/40 backdrop-blur-sm p-1.5 rounded-2xl border border-white/60">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-9 w-9 rounded-xl hover:bg-white/60 text-primary"
                                                                    onClick={() =>
                                                                        handleQuantityChange(
                                                                            item,
                                                                            Math.max(1, item.qty - 1),
                                                                        )
                                                                    }
                                                                >
                                                                    <Minus className="h-4 w-4" />
                                                                </Button>
                                                                <span className="w-8 text-center font-bold text-lg text-primary">
                                                                    {item.qty}
                                                                </span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-9 w-9 rounded-xl hover:bg-white/60 text-primary"
                                                                    onClick={() =>
                                                                        handleQuantityChange(item, item.qty + 1)
                                                                    }
                                                                    disabled={
                                                                        stockLimit !== undefined &&
                                                                        item.qty >= stockLimit
                                                                    }
                                                                >
                                                                    <Plus className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                                                            onClick={() =>
                                                                removeItem(item.skuId, user !== null)
                                                            }
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            {cartContent.step1.removeItem}
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Sección de Cupón */}
                                    {storeConfig?.enableCoupons !== false && (
                                        <div className="mt-8 pt-6 border-t border-primary/10">
                                            <Label className="mb-2 block">
                                                {cartContent.step1.coupon.label}
                                            </Label>
                                            {appliedCoupon ? (
                                                <div className="flex items-center gap-2 p-1 bg-white/50 rounded-full border border-primary/20 pl-4">
                                                    <span className="font-bold text-primary flex-1">
                                                        {appliedCoupon}
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:bg-destructive/10 rounded-full"
                                                        onClick={handleRemoveCoupon}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <Input
                                                        placeholder={cartContent.step1.coupon.placeholder}
                                                        value={couponCode}
                                                        onChange={(e) =>
                                                            setCouponCode(e.target.value.toUpperCase())
                                                        }
                                                        disabled={isUpdating}
                                                        className="rounded-full border-2 border-primary/40 focus:border-primary bg-white/50 backdrop-blur-sm text-gray-900 placeholder:text-gray-400"
                                                    />
                                                    <Button
                                                        onClick={handleApplyCoupon}
                                                        disabled={
                                                            couponMutation.isPending ||
                                                            !couponCode.trim() ||
                                                            isUpdating
                                                        }
                                                        className="rounded-full bg-gradient-to-r from-primary to-secondary text-white shadow-lg hover:shadow-xl transition-all"
                                                    >
                                                        {couponMutation.isPending
                                                            ? cartContent.step1.coupon.applying
                                                            : cartContent.step1.coupon.apply}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Sección de Contacto */}
                                    <div className="mt-8 pt-6 border-t border-primary/10">
                                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-primary">
                                            <User className="h-5 w-5" />
                                            Datos de Contacto
                                        </h3>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold flex items-center gap-2">
                                                    Número de WhatsApp *
                                                    <span className="text-[10px] font-normal text-muted-foreground">(Solo números, ej: 5491122334455)</span>
                                                </Label>
                                                <Input
                                                    type="tel"
                                                    placeholder="5491122334455"
                                                    value={customerData.phone}
                                                    onChange={(e) => {
                                                        const onlyNums = e.target.value.replace(/[^0-9]/g, "");
                                                        setCustomerData(prev => ({ ...prev, phone: onlyNums }));
                                                    }}
                                                    className="h-11 rounded-xl border-2 border-primary/30 focus:border-primary bg-white/50 font-medium"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <Separator className="my-8" />

                                    {/* Sección de Entrega */}
                                    <div className="mt-8 pt-6 border-t border-primary/10">
                                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-primary">
                                            <Truck className="h-5 w-5" />
                                            Tipo de envío
                                        </h3>

                                        <RadioGroup
                                            value={deliveryData.method}
                                            onValueChange={(val: "pickup" | "shipping") =>
                                                setDeliveryData((prev) => ({ ...prev, method: val }))
                                            }
                                            className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
                                        >
                                            <Label
                                                className={`flex items-center justify-between p-4 border-2 rounded-2xl cursor-pointer transition-all hover:shadow-md ${deliveryData.method === "pickup"
                                                        ? "border-primary bg-primary/5 shadow-primary/10"
                                                        : "border-border bg-white/50 hover:border-primary/20"
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <RadioGroupItem value="pickup" id="pickup" />
                                                    <div className="flex flex-col">
                                                        <span className="font-bold">En Sucursales</span>
                                                        <span className="text-xs text-muted-foreground">Gratis</span>
                                                    </div>
                                                </div>
                                            </Label>

                                            <Label
                                                className={`flex items-center justify-between p-4 border-2 rounded-2xl cursor-pointer transition-all hover:shadow-md ${deliveryData.method === "shipping"
                                                        ? "border-primary bg-primary/5 shadow-primary/10"
                                                        : "border-border bg-white/50 hover:border-primary/20"
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <RadioGroupItem value="shipping" id="shipping" />
                                                    <div className="flex flex-col">
                                                        <span className="font-bold">Envío a Domicilio</span>
                                                        <span className="text-xs text-muted-foreground">Costo adicional</span>
                                                    </div>
                                                </div>
                                            </Label>
                                        </RadioGroup>

                                        {deliveryData.method === "pickup" ? (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <Label className="text-sm font-semibold">Selecciona una sucursal *</Label>
                                                <Select
                                                    value={deliveryData.pickupBranchId}
                                                    onValueChange={(val) =>
                                                        setDeliveryData((prev) => ({ ...prev, pickupBranchId: val }))
                                                    }
                                                >
                                                    <SelectTrigger className="h-12 rounded-xl border-2 border-primary/20 bg-white/50">
                                                        <SelectValue placeholder="Elegir sucursal..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {branches.map((branch) => (
                                                            <SelectItem key={branch.id} value={String(branch.id)}>
                                                                {branch.name} - {branch.address}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={findNearestBranch}
                                                    className="w-full rounded-xl border-primary/30 text-primary hover:bg-primary/5"
                                                >
                                                    <MapPin className="h-4 w-4 mr-2" />
                                                    Buscar sucursal más cercana
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <div className="grid grid-cols-1 gap-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-semibold">Lugar *</Label>
                                                        <Select
                                                            value={selectedZoneId || ""}
                                                            onValueChange={(value) => {
                                                                const zone = shippingZones.find(z => String(z.id) === value);
                                                                if (zone) {
                                                                    setSelectedZoneId(value);
                                                                    setCustomerData(prev => ({
                                                                        ...prev,
                                                                        city: zone.city || "",
                                                                        state: zone.province || "",
                                                                        country: zone.country || prev.country || "",
                                                                    }));
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-11 rounded-xl border-2 border-primary/20 bg-white/50">
                                                                <SelectValue placeholder="Seleccionar Lugar..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {shippingZones.map((zone) => (
                                                                    <SelectItem key={zone.id} value={String(zone.id)}>
                                                                        {[zone.city, zone.province, zone.country].filter(Boolean).join(", ")}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Canje de puntos */}
                                    {user &&
                                        user.points > 0 &&
                                        storeConfig?.enablePoints &&
                                        storeConfig?.enablePointsRedemption && (
                                            <div className="mt-8 pt-6 border-t border-primary/10">
                                                <div className="flex items-center justify-between mb-4">
                                                    <Label className="font-bold flex items-center gap-2">
                                                        <Check className="h-4 w-4 text-amber-500" />
                                                        Canjear Puntos
                                                    </Label>
                                                    <span className="text-sm text-muted-foreground">
                                                        Disponibles:{" "}
                                                        <span className="font-bold text-amber-600">
                                                            {user.points} pts
                                                        </span>
                                                    </span>
                                                </div>

                                                <div className="flex gap-4 items-end">
                                                    <div className="flex-1">
                                                        <Input
                                                            type="number"
                                                            inputMode="numeric"
                                                            placeholder="Cantidad de puntos a usar"
                                                            value={pointsToUse || ""}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value) || 0;
                                                                setPointsToUse(
                                                                    val > user.points ? user.points : val,
                                                                );
                                                            }}
                                                            disabled={isUpdating}
                                                            className="h-12 rounded-xl border-2 border-primary/20 focus:border-primary bg-white/50"
                                                        />
                                                    </div>
                                                    {pointsToUse > 0 &&
                                                        (preview?.pointsDiscount ?? 0) > 0 && (
                                                            <div className="h-12 flex items-center px-4 bg-amber-50 border-2 border-amber-200 rounded-xl animate-in fade-in zoom-in duration-300">
                                                                <span className="text-amber-700 font-bold text-sm">
                                                                    Ahorras:{" "}
                                                                    {formatPrice(
                                                                        preview?.pointsDiscount ?? 0,
                                                                        currency,
                                                                    )}
                                                                </span>
                                                            </div>
                                                        )}
                                                    {pointsToUse > 0 && pointsToUse !== appliedPoints && (
                                                        <Button
                                                            className="h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 shadow-md hover:shadow-lg transition-all"
                                                            onClick={() => setAppliedPoints(pointsToUse)}
                                                            disabled={isUpdating}
                                                        >
                                                            Canjear
                                                        </Button>
                                                    )}
                                                    {(pointsToUse > 0 || appliedPoints > 0) && (
                                                        <Button
                                                            variant="ghost"
                                                            className="h-12 rounded-xl text-destructive hover:bg-destructive/10"
                                                            onClick={() => {
                                                                setPointsToUse(0);
                                                                setAppliedPoints(0);
                                                            }}
                                                            disabled={isUpdating}
                                                        >
                                                            Limpiar
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                    {/* Vista previa de puntos ganados */}
                                    {storeConfig?.enablePoints && (
                                        <div className="mt-4 flex items-center gap-2 text-amber-600 font-bold bg-amber-50 p-3 rounded-2xl border border-amber-100 animate-in fade-in duration-500">
                                            <Award className="h-4 w-4" />
                                            <span>
                                                ¡Ganarás{" "}
                                                {preview?.totalPointsEarned ??
                                                    (() => {
                                                        const pointsRate =
                                                            storeConfig.activeEvent?.pointsPerCurrency ||
                                                            storeConfig.pointsPerCurrency ||
                                                            0.001;
                                                        return Math.floor(clientSubtotal * pointsRate);
                                                    })()}{" "}
                                                puntos con esta compra!
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Paso 4: Pago */}
                            {currentStep === "payment" && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent inline-block">
                                        {cartContent.step4.title}
                                    </h2>
                                    <p className="text-muted-foreground mb-8 text-lg">
                                        {cartContent.step4.subtitle}
                                    </p>

                                    <div className="space-y-6">
                                        {/* Selección de métodos de pago */}
                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                           

                                    
                                            {selectedGateway === "QR" && (
                                                <Card className="p-6 border-4 border-secondary/40 bg-secondary/5 rounded-[2rem] space-y-6 mt-4 animate-in fade-in-50 duration-300">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary">
                                                            <QrCode size={20} />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-lg font-black uppercase tracking-tight text-secondary">
                                                                Pago con QR
                                                            </h4>
                                                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                                                Realiza tu transferencia escaneando el código QR
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Mostrar el QR persistente de la tienda */}
                                                    {storeConfig?.enablePersistentQr && storeConfig?.persistentQrUrl ? (
                                                        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border-2 border-secondary/20 shadow-sm max-w-[280px] mx-auto animate-in zoom-in-95 duration-300">
                                                            <img
                                                                src={storeConfig.persistentQrUrl}
                                                                alt="QR de Pago"
                                                                className="w-[200px] h-[200px] object-contain rounded-lg"
                                                            />
                                                            <p className="text-[10px] text-muted-foreground font-bold mt-2 uppercase tracking-widest text-center">
                                                                Escanea para transferir
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center p-6 bg-white/40 rounded-2xl border-2 border-dashed border-secondary/20 max-w-[280px] mx-auto text-center">
                                                            <QrCode size={48} className="text-secondary/40 animate-pulse mb-2" />
                                                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                                                QR General del Comercio
                                                            </p>
                                                        </div>
                                                    )}

                                                    <div className="space-y-4">
                                                        <h5 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-1">
                                                            Datos del QR (Nombre, Celular, etc.)
                                                        </h5>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                                                      <div className="space-y-1">
                                                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                                                    Celular / WhatsApp
                                                                </Label>
                                                                <Input
                                                                    placeholder="Celular"
                                                                    value={customerData.phone}
                                                                    onChange={(e) => setCustomerData(prev => ({ ...prev, phone: e.target.value }))}
                                                                    className="rounded-xl border-2 h-11"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Subir Captura de Pago */}
                                                    <div className="space-y-3">
                                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                                            Captura del Comprobante
                                                        </Label>

                                                        <div className="flex flex-col gap-3">
                                                            <Button
                                                                type="button"
                                                                onClick={() => qrFileInputRef.current?.click()}
                                                                className="w-full h-12 text-sm font-bold rounded-xl bg-gradient-to-r from-secondary to-primary hover:opacity-90 shadow-md flex items-center justify-center gap-2 text-white transition-all duration-300"
                                                            >
                                                                <Upload size={18} />
                                                                Subir Captura de Pago
                                                            </Button>

                                                            <div
                                                                onClick={() => qrFileInputRef.current?.click()}
                                                                className="aspect-video max-h-[160px] rounded-2xl border-2 border-dashed border-secondary/30 bg-secondary/5 flex flex-col items-center justify-center cursor-pointer hover:bg-secondary/10 transition-all group overflow-hidden relative"
                                                            >
                                                                {qrPaymentProof ? (
                                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm p-4 text-center animate-in fade-in duration-300">
                                                                        <CheckCircle2 className="h-10 w-10 text-green-500 mb-1" />
                                                                        <p className="font-black text-xs text-primary line-clamp-1 font-mono">
                                                                            {qrPaymentProof.name}
                                                                        </p>
                                                                        <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5">
                                                                            {(qrPaymentProof.size / 1024 / 1024).toFixed(2)} MB
                                                                        </p>
                                                                        <p className="text-[10px] text-secondary font-bold uppercase mt-1">
                                                                            Haz clic o presiona el botón para cambiar
                                                                        </p>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <Upload size={24} className="text-secondary/60 group-hover:scale-110 transition-transform mb-2" />
                                                                        <span className="font-bold text-xs text-secondary/80 tracking-tight">
                                                                            Vista previa de la captura
                                                                        </span>
                                                                        <span className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                                                                            PNG, JPG (Máx 5MB)
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <input
                                                            type="file"
                                                            className="hidden"
                                                            ref={qrFileInputRef}
                                                            onChange={(e) => {
                                                                if (e.target.files && e.target.files[0]) {
                                                                    const file = e.target.files[0];
                                                                    if (file.size > 5 * 1024 * 1024) {
                                                                        toast.error("El archivo es demasiado grande (máx 5MB)");
                                                                        return;
                                                                    }
                                                                    setQrPaymentProof(file);
                                                                }
                                                            }}
                                                            accept="image/*"
                                                        />
                                                    </div>
                                                </Card>
                                            )}
                                        </div>

                                        <div className="mt-8 space-y-3">
                                            <Button
                                                className="w-full h-14 text-lg font-bold rounded-full bg-gradient-to-r from-primary to-secondary shadow-lg hover:shadow-xl hover:shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={handlePlaceOrder}
                                                disabled={
                                                    createOrderMutation.isPending ||
                                                    isUpdating ||
                                                    isUploadingProof ||
                                                    !selectedGateway ||
                                                    isRedirecting ||
                                                    preview === null ||
                                                    (preview?.total !== undefined && preview.total <= 0) ||
                                                    (selectedGateway === "QR" && !qrPaymentProof)
                                                }
                                            >
                                                {createOrderMutation.isPending || isUploadingProof || isRedirecting ? (
                                                    <>
                                                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                                        {isUploadingProof
                                                            ? "Subiendo comprobante..."
                                                            : isRedirecting
                                                                ? "Redirigiendo..."
                                                                : cartContent.step4.placingOrder}
                                                    </>
                                                ) : selectedGateway === "QR" && !qrPaymentProof ? (
                                                    "Falta captura de pago"
                                                ) : (
                                                    cartContent.step4.placeOrder
                                                )}
                                            </Button>

                                            <Button
                                                variant="ghost"
                                                className="w-full rounded-full hover:bg-muted font-medium"
                                                onClick={handleBack}
                                            >
                                                Atrás
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>

                    {currentStep !== "payment" && (
                    <div className="lg:col-span-1">
                        <Card className="p-6 md:p-8 md:px-5 rounded-[2rem] border-2 border-primary/70 bg-white/60 backdrop-blur-xl shadow-xl sticky top-0 overflow-hidden relative">
                            {/* Loader Localizado de la Tarjeta de Precios  */}
                            {isUpdating && !bypassLoading && (
                                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-md rounded-3xl animate-in fade-in duration-500">
                                    <div className="text-center p-8 bg-white rounded-3xl shadow-2xl max-w-sm mx-4 animate-in zoom-in duration-300">
                                        <div className="relative w-24 h-24 mx-auto mb-6">
                                            <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                                            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                            <ShieldCheck className="absolute inset-0 m-auto h-12 w-12 text-primary animate-pulse" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                                            Cálculo Seguro en Progreso
                                        </h3>
                                        <p className="text-gray-500 text-sm leading-relaxed mb-4">
                                            Validando precios, impuestos y descuentos con precisión
                                            total para su seguridad.
                                        </p>
                                        {showBypass && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                                                onClick={() => {
                                                    setBypassLoading(true);
                                                    toast.warning("Continuando con precios estimados...");
                                                }}
                                            >
                                                ¿Tarda demasiado? Continuar de todas formas
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                                <span className="w-1 h-6 bg-gradient-to-b from-primary to-secondary rounded-full"></span>
                                {cartContent.step1.summary.titulo}
                            </h2>

                            <div
                                className={`transition-opacity duration-200 ${isUpdating ? "opacity-30" : "opacity-100"}`}
                            >
                                {/* Tabla de Productos Detallada */}
                                <div className="mb-6 overflow-hidden rounded-2xl border border-primary/10 shadow-sm bg-white/40">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-primary/5 border-b border-primary/10 text-[11px] font-black uppercase tracking-wider text-primary">
                                                <th className="p-3 pl-4">Producto</th>
                                                <th className="p-3 text-right">Costo</th>
                                                <th className="p-3 text-right">Cantidad</th>
                                                <th className="p-3 pr-4 text-right">Monto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-primary/5 text-xs font-semibold text-gray-700">
                                            {items.map((item) => {
                                                const formattedUnit = item.measurementUnit === "KG"
                                                    ? "Kg"
                                                    : item.measurementUnit === "LITRO"
                                                        ? "L"
                                                        : item.measurementUnit === "METRO"
                                                            ? "m"
                                                            : item.measurementUnit === "UNIDAD"
                                                                ? "u"
                                                                : item.measurementUnit || "u";

                                                return (
                                                    <tr key={item.skuId} className="hover:bg-primary/5 transition-colors">
                                                        <td className="p-3 pl-4 font-bold text-gray-950 max-w-[120px] truncate" title={item.productName}>
                                                            {item.productName}
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-[11px]">
                                                            {formatPrice(item.price, currency)}
                                                        </td>
                                                        <td className="p-3 text-right text-muted-foreground whitespace-nowrap">
                                                            {item.qty} <span className="text-[10px] font-bold uppercase">{formattedUnit}</span>
                                                        </td>
                                                        <td className="p-3 pr-4 text-right font-bold font-mono text-primary">
                                                            {formatPrice(item.price * item.qty, currency)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Desglose Jerárquico de Precios */}
                                <div className="space-y-1 mb-6">
                                    {/* SUBTOTAL */}
                                    <div className="flex justify-between text-base font-semibold text-gray-800 pb-2 border-b border-primary/10">
                                        <span>{cartContent.step1.summary.subtotal}</span>
                                        <span>
                                            {formatPrice(
                                                isUpdating
                                                    ? clientSubtotal
                                                    : preview?.subtotal || clientSubtotal,
                                                currency,
                                            )}
                                        </span>
                                    </div>

                                    {/* CARGOS Y DESCUENTOS (Tabulados) */}
                                    <div className="pl-3 border-l-2 border-primary/20 space-y-2 pt-2">
                                        {/* Promociones automáticas */}
                                        {preview?.appliedDiscounts &&
                                            preview.appliedDiscounts.length > 0 && (
                                                <div className="space-y-1">
                                                    {preview.appliedDiscounts.map((discount, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex justify-between text-xs text-emerald-600 font-bold bg-emerald-50 p-1.5 rounded-lg border border-emerald-100"
                                                        >
                                                            <span className="flex items-center gap-1">
                                                                <Tag className="h-3 w-3" />
                                                                {discount.name}
                                                            </span>
                                                            <span>
                                                                -
                                                                {formatPrice(discount.discountAmount, currency)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                        {/* Cupones */}
                                        {storeConfig?.enableCoupons !== false &&
                                            preview?.discountDetails && (
                                                <div className="space-y-2">
                                                    {preview.discountDetails?.error ? (
                                                        <div className="flex flex-col gap-1 text-xs text-destructive font-bold bg-destructive/10 p-2 rounded-lg border border-destructive/20 animate-pulse">
                                                            <span className="flex items-center gap-1">
                                                                <AlertCircle className="h-3 w-3" />
                                                                Error en cupón {appliedCoupon}:
                                                            </span>
                                                            <span className="font-medium opacity-90">
                                                                {preview.discountDetails?.error}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-between text-xs text-emerald-600 font-bold bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
                                                            <span className="flex items-center gap-1">
                                                                <Tag className="h-3 w-3" />
                                                                Cupón: {preview.discountDetails.code}
                                                            </span>
                                                            <span>
                                                                -
                                                                {formatPrice(
                                                                    preview?.discountDetails?.amount || 0,
                                                                    currency,
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                        {/* Descuentos por Puntos */}
                                        {storeConfig?.enablePoints &&
                                            (preview?.pointsDiscount ?? 0) > 0 && (
                                                <div className="flex justify-between text-xs text-amber-600 font-bold bg-amber-50 p-1.5 rounded-lg border border-amber-100">
                                                    <span className="flex items-center gap-1">
                                                        <Award className="h-3 w-3" />
                                                        Descuento por Puntos
                                                    </span>
                                                    <span>
                                                        -
                                                        {formatPrice(
                                                            preview?.pointsDiscount ?? 0,
                                                            currency,
                                                        )}
                                                    </span>
                                                </div>
                                            )}

                                        {/* Envío */}
                                        <div className="flex justify-between text-xs text-cyan-700 font-bold bg-cyan-50 p-1.5 rounded-lg border border-cyan-100">
                                            <span className="flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {cartContent.step1.summary.shipping}
                                            </span>
                                            <span
                                                className={
                                                    (deliveryData.method === "pickup" &&
                                                        deliveryData.pickupBranchId) ||
                                                        (deliveryData.method === "shipping" &&
                                                            preview?.shipping === 0)
                                                        ? "text-emerald-600"
                                                        : ""
                                                }
                                            >
                                                {deliveryData.method === "pickup" &&
                                                    deliveryData.pickupBranchId
                                                    ? "Gratis"
                                                    : deliveryData.method === "shipping" &&
                                                        preview?.shipping === 0
                                                        ? "Gratis"
                                                        : typeof preview?.shipping === "number" &&
                                                            preview.shipping > 0
                                                            ? formatPrice(preview.shipping, currency)
                                                            : "A definir"}
                                            </span>
                                        </div>

                                        {/* Impuestos */}
                                        {(preview?.tax > 0 ||
                                            (storeConfig?.taxRate &&
                                                Number(storeConfig.taxRate) > 0) ||
                                            !storeConfig) && (
                                                <div className="flex justify-between text-xs text-indigo-600 font-bold bg-indigo-50 p-1.5 rounded-lg border border-indigo-100">
                                                    <span className="flex items-center gap-1">
                                                        <AlertCircle className="h-3 w-3" />
                                                        {cartContent.step1.summary.tax}
                                                        {preview?.tax === 0 && storeConfig?.taxRate && (
                                                            <span className="text-[10px] font-normal opacity-70">
                                                                ({storeConfig.taxRate}%)
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span>
                                                        {formatPrice(
                                                            preview?.tax ||
                                                            clientSubtotal *
                                                            (Number(storeConfig?.taxRate || 0) / 100),
                                                            currency,
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                    </div>
                                </div>

                                <Separator className="my-6 bg-primary/20" />

                                <div className="flex  items-end mb-8 relative gap-1">
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 ml-1">
                                            Total Final
                                        </p>
                                        <div className="text-4xl font-black text-gray-950 flex items-baseline gap-1">
                                            {formatPrice(
                                                isUpdating
                                                    ? preview?.total || clientSubtotal
                                                    : preview?.total || clientSubtotal,
                                                currency
                                            )}
                                        </div>
                                    </div>
                                    {isUpdating && (
                                        <span className="text-[10px] text-primary font-bold animate-pulse absolute -bottom-5 right-0 whitespace-nowrap">
                                            Sincronizando...
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Button
                                    className="w-full h-14 text-lg font-bold rounded-full bg-gradient-to-r from-primary to-secondary shadow-lg hover:shadow-xl hover:shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={handleNext}
                                    disabled={
                                        !canProceed() ||
                                        isUpdating ||
                                        preview === null
                                    }
                                >
                                    {isUpdating ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Calculando...
                                        </>
                                    ) : (
                                        "Siguiente: Pagar"
                                    )}
                                </Button>

                                {currentStep !== "cart" && (
                                    <Button
                                        variant="ghost"
                                        className="w-full rounded-full hover:bg-muted font-medium"
                                        onClick={handleBack}
                                    >
                                        Atrás
                                    </Button>
                                )}
                            </div>

                            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                <div className="flex gap-2 opacity-50">
                                    <div className="w-8 h-5 bg-gray-400 rounded"></div>
                                    <div className="w-8 h-5 bg-gray-400 rounded"></div>
                                    <div className="w-8 h-5 bg-gray-400 rounded"></div>
                                </div>
                                <span>Pagos Seguros</span>
                            </div>
                        </Card>
                    </div>
                    )}
                </div>
            </div>

            <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
                <DialogContent className="sm:max-w-md p-8 border-2 border-primary/20 rounded-3xl bg-white/95 backdrop-blur-xl shadow-2xl">
                    <DialogHeader>
                        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle2 className="w-10 h-10 text-primary" />
                        </div>
                        <DialogTitle className="text-center text-3xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                            ¡Compra Exitosa!
                        </DialogTitle>
                        <DialogDescription className="text-center text-lg mt-4 text-gray-600 font-medium leading-relaxed">
                            Su compra ha sido realizada con éxito. Nos comunicaremos a su WhatsApp para coordinar la entrega.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="sm:justify-center mt-8">
                        <Button
                            onClick={() => {
                                setShowSuccessDialog(false);
                                router.push("/");
                            }}
                            className="w-full sm:w-auto bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-full h-14 px-10 text-lg shadow-xl hover:shadow-primary/20 transition-all hover:-translate-y-1"
                        >
                            Aceptar y Continuar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );
}
