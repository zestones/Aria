import { Navigate, Route, Routes } from "react-router-dom";
import RequireAuth from "../components/RequireAuth";
import ControlRoomPage from "../pages/ControlRoomPage";
import DataPage from "../pages/DataPage";
import DesignPage from "../pages/DesignPage";
import LoginPage from "../pages/LoginPage";
import OnboardingPage from "../pages/OnboardingPage";
import { AppShell } from "./AppShell";

export function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/design" element={<DesignPage />} />
            <Route
                path="/data"
                element={
                    <RequireAuth>
                        <DataPage />
                    </RequireAuth>
                }
            />
            <Route
                path="/onboarding"
                element={
                    <RequireAuth>
                        <OnboardingPage />
                    </RequireAuth>
                }
            />
            <Route
                path="/onboarding/:session_id"
                element={
                    <RequireAuth>
                        <OnboardingPage />
                    </RequireAuth>
                }
            />
            <Route
                element={
                    <RequireAuth>
                        <AppShell />
                    </RequireAuth>
                }
            >
                <Route path="/control-room" element={<ControlRoomPage />} />
            </Route>
            <Route path="/" element={<Navigate to="/control-room" replace />} />
            <Route path="*" element={<Navigate to="/control-room" replace />} />
        </Routes>
    );
}
