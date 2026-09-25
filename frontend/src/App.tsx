import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { Toaster } from "sonner";

const App = () => {
    return (
        <>
            <RouterProvider router={router} />
            <Toaster richColors position="top-right" closeButton />
        </>
    );
};

export default App;
