import {
  Car,
  CreditCard,
  DollarSign,
  Fuel,
  GraduationCap,
  Home,
  Receipt,
  Repeat,
  ShoppingCart,
} from "lucide-react";
import React from "react";

/** Icon guessed from a debt or expense label so user-added rows get a fitting glyph. */
export function categoryIcon(label: string, size = 15): React.ReactNode {
  if (/gasoline|petrol|fuel|\bgas\b/i.test(label)) return <Fuel size={size} />;
  if (/transport|transit|commute|uber|lyft|\bcar\b|\bauto\b|vehicle|parking/i.test(label)) {
    return <Car size={size} />;
  }
  if (/credit[_\s-]*card|visa|mastercard|amex|\bcards?\b/i.test(label)) return <CreditCard size={size} />;
  if (/student[_\s-]*loan|educat|tuition|university|college|school/i.test(label)) {
    return <GraduationCap size={size} />;
  }
  if (/housing|mortgage|rent|\bhome\b|apartment|landlord/i.test(label)) return <Home size={size} />;
  if (/\bbills?\b|utilit|electric|water|internet|phone|heat|wifi/i.test(label)) {
    return <Receipt size={size} />;
  }
  if (/food|grocer|dining|eat|meal|restaurant/i.test(label)) return <ShoppingCart size={size} />;
  if (/sub|stream|member|plan/i.test(label)) return <Repeat size={size} />;
  return <DollarSign size={size} />;
}
