import type { LucideIcon, LucideProps } from "lucide-react";
import {
    Activity as RawActivity,
    AlertCircle as RawAlertCircle,
    AlertTriangle as RawAlertTriangle,
    ArrowLeft as RawArrowLeft,
    ArrowRight as RawArrowRight,
    Building2 as RawBuilding2,
    Check as RawCheck,
    ChevronDown as RawChevronDown,
    ChevronLeft as RawChevronLeft,
    ChevronRight as RawChevronRight,
    ChevronUp as RawChevronUp,
    CircleDot as RawCircleDot,
    Clock as RawClock,
    Command as RawCommand,
    Copy as RawCopy,
    Cpu as RawCpu,
    Database as RawDatabase,
    Eye as RawEye,
    FileText as RawFileText,
    Filter as RawFilter,
    Gauge as RawGauge,
    GitBranch as RawGitBranch,
    Layers as RawLayers,
    Loader2 as RawLoader2,
    LogOut as RawLogOut,
    MapPin as RawMapPin,
    Maximize2 as RawMaximize2,
    MessageCircle as RawMessageCircle,
    MessageSquare as RawMessageSquare,
    Monitor as RawMonitor,
    MoreHorizontal as RawMoreHorizontal,
    PanelLeftClose as RawPanelLeftClose,
    PanelLeftOpen as RawPanelLeftOpen,
    PanelRightClose as RawPanelRightClose,
    PanelRightOpen as RawPanelRightOpen,
    Play as RawPlay,
    Plus as RawPlus,
    Printer as RawPrinter,
    RefreshCw as RawRefreshCw,
    Search as RawSearch,
    Settings as RawSettings,
    Sparkles as RawSparkles,
    Upload as RawUpload,
    User as RawUser,
    Users as RawUsers,
    Wrench as RawWrench,
    X as RawX,
} from "lucide-react";
import { forwardRef } from "react";

/**
 * Wraps a raw lucide icon so it renders with stroke-width 1.75 by default
 * (matches our 1px hairline grid). Caller can still override via the prop.
 * See DESIGN_PLAN §7.
 */
function styled(Raw: LucideIcon, name: string) {
    const Wrapped = forwardRef<SVGSVGElement, LucideProps>(
        ({ strokeWidth = 1.75, ...props }, ref) => (
            <Raw ref={ref} strokeWidth={strokeWidth} {...props} />
        ),
    );
    Wrapped.displayName = `Icon.${name}`;
    return Wrapped;
}

export const Activity = styled(RawActivity, "Activity");
export const AlertCircle = styled(RawAlertCircle, "AlertCircle");
export const AlertTriangle = styled(RawAlertTriangle, "AlertTriangle");
export const ArrowLeft = styled(RawArrowLeft, "ArrowLeft");
export const ArrowRight = styled(RawArrowRight, "ArrowRight");
export const Building2 = styled(RawBuilding2, "Building2");
export const Check = styled(RawCheck, "Check");
export const ChevronDown = styled(RawChevronDown, "ChevronDown");
export const ChevronLeft = styled(RawChevronLeft, "ChevronLeft");
export const ChevronRight = styled(RawChevronRight, "ChevronRight");
export const ChevronUp = styled(RawChevronUp, "ChevronUp");
export const CircleDot = styled(RawCircleDot, "CircleDot");
export const Clock = styled(RawClock, "Clock");
export const Command = styled(RawCommand, "Command");
export const Copy = styled(RawCopy, "Copy");
export const Cpu = styled(RawCpu, "Cpu");
export const Database = styled(RawDatabase, "Database");
export const Eye = styled(RawEye, "Eye");
export const FileText = styled(RawFileText, "FileText");
export const Filter = styled(RawFilter, "Filter");
export const Gauge = styled(RawGauge, "Gauge");
export const GitBranch = styled(RawGitBranch, "GitBranch");
export const Layers = styled(RawLayers, "Layers");
export const Loader2 = styled(RawLoader2, "Loader2");
export const LogOut = styled(RawLogOut, "LogOut");
export const Maximize2 = styled(RawMaximize2, "Maximize2");
export const MapPin = styled(RawMapPin, "MapPin");
export const MessageCircle = styled(RawMessageCircle, "MessageCircle");
export const MessageSquare = styled(RawMessageSquare, "MessageSquare");
export const Monitor = styled(RawMonitor, "Monitor");
export const MoreHorizontal = styled(RawMoreHorizontal, "MoreHorizontal");
export const PanelLeftClose = styled(RawPanelLeftClose, "PanelLeftClose");
export const PanelLeftOpen = styled(RawPanelLeftOpen, "PanelLeftOpen");
export const PanelRightClose = styled(RawPanelRightClose, "PanelRightClose");
export const PanelRightOpen = styled(RawPanelRightOpen, "PanelRightOpen");
export const Play = styled(RawPlay, "Play");
export const Plus = styled(RawPlus, "Plus");
export const Printer = styled(RawPrinter, "Printer");
export const RefreshCw = styled(RawRefreshCw, "RefreshCw");
export const Search = styled(RawSearch, "Search");
export const Settings = styled(RawSettings, "Settings");
export const Sparkles = styled(RawSparkles, "Sparkles");
export const Upload = styled(RawUpload, "Upload");
export const User = styled(RawUser, "User");
export const Users = styled(RawUsers, "Users");
export const Wrench = styled(RawWrench, "Wrench");
export const X = styled(RawX, "X");
