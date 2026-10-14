import {
  AlignLeft,
  ArrowUpRight,
  AtSign,
  Calendar,
  CheckSquare,
  CircleChevronDown,
  Clock,
  DollarSign,
  Hash,
  Link2,
  List,
  Paperclip,
  Percent,
  Phone,
  Sigma,
  Star,
  Type,
  User,
  UserPen,
  type LucideIcon,
} from "lucide-react";
import type { FieldType } from "@/lib/types";

const ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  longText: AlignLeft,
  number: Hash,
  currency: DollarSign,
  percent: Percent,
  checkbox: CheckSquare,
  singleSelect: CircleChevronDown,
  multiSelect: List,
  date: Calendar,
  email: AtSign,
  url: ArrowUpRight,
  phone: Phone,
  rating: Star,
  link: Link2,
  attachment: Paperclip,
  user: User,
  formula: Sigma,
  createdTime: Clock,
  lastModifiedTime: Clock,
  createdBy: User,
  lastModifiedBy: UserPen,
};

export function FieldIcon({ type, size = 14, className }: { type: FieldType; size?: number; className?: string }) {
  const Icon = ICONS[type] ?? Type;
  return <Icon size={size} className={className ?? "shrink-0 text-gray-500"} />;
}
