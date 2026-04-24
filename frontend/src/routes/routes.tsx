import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout";
import { WorkOrderDetail, WorkOrderList } from "../features/work-orders";
import {
    AnomaliesPage,
    ControlRoomPage,
    DataPage,
    DesignPage,
    LogbookPage,
    LoginPage,
    OnboardingPage,
    WorkspacePage,
} from "../pages";
import RequireAuth from "./auth-guards";

export function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/design" element={<DesignPage />} />
            <Route
                path="/workspace"
                element={
                    <RequireAuth>
                        <WorkspacePage />
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
                <Route path="/anomalies" element={<AnomaliesPage />} />
                <Route path="/work-orders" element={<WorkOrderList />} />
                <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
                <Route path="/logbook" element={<LogbookPage />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/onboarding/:session_id" element={<OnboardingPage />} />
            </Route>

            <Route path="/" element={<Navigate to="/control-room" replace />} />
            <Route path="*" element={<Navigate to="/control-room" replace />} />
        </Routes>
    );
}
