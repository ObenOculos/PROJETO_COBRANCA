import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { LoadingProvider, useLoading } from "./contexts/LoadingContext";
import GlobalLoading from "./components/common/GlobalLoading";

const Root = () => {
  const { isLoading, loadingMessage } = useLoading();

  return (
    <>
      {isLoading && <GlobalLoading message={loadingMessage} />}
      <App />
    </>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoadingProvider>
      <Root />
    </LoadingProvider>
  </StrictMode>,
);
