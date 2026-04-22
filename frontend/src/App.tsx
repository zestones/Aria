import { Navigate, Route, Routes } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import DataPage from "./pages/DataPage";
import DesignPage from "./pages/DesignPage";
import LoginPage from "./pages/LoginPage";

export default function App() {
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
            <Route path="*" element={<Navigate to="/data" replace />} />
        </Routes>
    );
}
