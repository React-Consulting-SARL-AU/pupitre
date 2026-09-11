import { Component, type ReactNode } from "react";
import { ScreenFailure } from "./screen-failure";

/**
 * What stands between a screen that throws and a window that goes white.
 *
 * A render that raises unmounts everything above it, which used to take the
 * sidebar and the whole app with it: the reader saw a blank page and had no
 * way back. The screen alone is lost here, said plainly, and leaving it is
 * enough to try again — `view` changes, the boundary forgets what happened.
 */
// biome-ignore lint/style/useReactFunctionComponents: React has no function form of an error boundary; getDerivedStateFromError is a class API
export class ScreenBoundary extends Component<
  { view: string; children: ReactNode },
  { failure: Error | null }
> {
  state: { failure: Error | null } = { failure: null };

  static getDerivedStateFromError(failure: Error): { failure: Error } {
    return { failure };
  }

  componentDidUpdate(previous: { view: string }): void {
    if (previous.view !== this.props.view && this.state.failure) {
      this.setState({ failure: null });
    }
  }

  render(): ReactNode {
    const { failure } = this.state;

    if (!failure) {
      return this.props.children;
    }

    return (
      <ScreenFailure
        detail={failure.message}
        onRetry={() => this.setState({ failure: null })}
      />
    );
  }
}
