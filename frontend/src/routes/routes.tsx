import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout";
import { WorkOrderDetail, WorkOrderList } from "../features/work-orders";
import { ControlRoomPage, DataPage, DesignPage, LoginPage, OnboardingPage } from "../pages";
import RequireAuth from "./auth-guards";

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
                <Route path="/work-orders" element={<WorkOrderList />} />
                <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
            </Route>
            <Route path="/" element={<Navigate to="/control-room" replace />} />
            <Route path="*" element={<Navigate to="/control-room" replace />} />
        </Routes>
    );
}
