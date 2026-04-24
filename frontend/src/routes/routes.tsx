import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout";
import { WorkOrderDetail, WorkOrderList } from "../features/work-orders";
import {
    AnomaliesPage,
    ControlRoomPage,
    DataPage,
    DesignPage,
    LoginPage,
    OnboardingPage,
    WorkspacePage,
} from "../pages";
import RequireAuth from "./auth-guards";

export function AppRoutes() {
    return (
        <Routes>
            {/* Public / unauthenticated surfaces — render bare, no shell. */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/design" element={<DesignPage />} />

            {/* Full-screen Agent Workspace — deliberately rendered
                outside AppShell so the artifact canvas owns the entire
                viewport. Auth-gated like the rest of the app. */}
            <Route
                path="/workspace"
                element={
                    <RequireAuth>
                        <WorkspacePage />
                    </RequireAuth>
                }
            />

            {/* Single global shell for every authenticated page. Mirrors the
                IAP pattern (RequireAuth wraps AppLayout once) so Sidebar +
                TopBar stay mounted across navigation and own a single
                source of truth for sidebar/drawer state. */}
            <Route
                element={
                    <RequireAuth>
                        <AppShell />
                    </RequireAuth>
                }
            >
                <Route path="/control-room" element={<ControlRoomPage />} />
                <Route path="/anomalies" element={<AnomaliesPage />} />
                <Route path="/work-orders" element={<WorkOrderList />} />
                <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/onboarding/:session_id" element={<OnboardingPage />} />
            </Route>

            <Route path="/" element={<Navigate to="/control-room" replace />} />
            <Route path="*" element={<Navigate to="/control-room" replace />} />
        </Routes>
    );
}
