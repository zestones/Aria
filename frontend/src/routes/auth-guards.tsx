import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "../services/auth";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    if (!isAuthenticated()) {
        return <Navigate to="/" replace state={{ from: location }} />;
    }
    return <>{children}</>;
}
