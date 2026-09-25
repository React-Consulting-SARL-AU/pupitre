import { useGestureFailure } from "@renderer/stores/gesture-failure";
import { Callout } from "../ui/callout";

export function GestureFailureNotice() {
  const failure = useGestureFailure((state) => state.failure);
  const dismiss = useGestureFailure((state) => state.dismiss);

  if (!failure) {
    return null;
  }

  return (
    <div className="clickable fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="w-full max-w-lg animate-enter" key={failure.count}>
        <Callout name="gesture-failure" onDismiss={dismiss} tone="danger">
          {failure.text}
        </Callout>
      </div>
    </div>
  );
}
