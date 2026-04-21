import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "../lib/auth";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }
    return <>{children}</>;
}
