/** Types for polarEmbed.js (@polar-sh/checkout 0.6.0, dist/embed.d.ts; Apache-2.0). */
//#region src/checkout.d.ts
/**
 * Message sent to the parent window when the embedded checkout is fully loaded.
 */
interface EmbedCheckoutMessageLoaded {
  event: 'loaded';
}
/**
 * Message sent to the parent window when the embedded checkout needs to be closed.
 */
interface EmbedCheckoutMessageClose {
  event: 'close';
}
/**
 * Message sent to the parent window when the checkout is confirmed.
 *
 * At that point, the parent window shouldn't allow to close the checkout.
 */
interface EmbedCheckoutMessageConfirmed {
  event: 'confirmed';
}
/**
 * Message sent to the parent window when the checkout is successfully completed.
 *
 * If `redirect` is set to `true`, the parent window should redirect to the `successURL`.
 */
interface EmbedCheckoutMessageSuccess {
  event: 'success';
  successURL: string;
  redirect: boolean;
}
/**
 * Represents an embedded checkout message.
 */
type EmbedCheckoutMessage = EmbedCheckoutMessageLoaded | EmbedCheckoutMessageClose | EmbedCheckoutMessageConfirmed | EmbedCheckoutMessageSuccess;
/**
 * Represents an embedded checkout instance.
 */
declare class EmbedCheckout {
  private iframe;
  private loader;
  private loaded;
  private closable;
  private eventTarget;
  private windowMessageListener;
  constructor(iframe: HTMLIFrameElement, loader: HTMLDivElement);
  /**
   * Send an embed checkout event to the parent window.
   * @param message
   * @param targetOrigin
   */
  static postMessage(message: EmbedCheckoutMessage, targetOrigin: string): void;
  /**
   * Create a new embedded checkout instance by injecting an iframe into the DOM.
   *
   * @param url A Checkout Link.
   * @param options Configuration options for the embedded checkout.
   * @param options.theme The theme of the embedded checkout. Defaults to `light`.
   * @param options.onLoaded Callback function that will be invoked when the checkout is fully loaded.
   *
   * @returns A promise that resolves to an instance of EmbedCheckout.
   * The promise resolves when the embedded checkout is fully loaded.
   */
  static create(url: string, options?: {
    theme?: 'light' | 'dark';
    onLoaded?: (event: CustomEvent<EmbedCheckoutMessageLoaded>) => void;
  }): Promise<EmbedCheckout>;
  /**
   * Initialize embedded checkout triggers.
   *
   * This method will add a click event listener to all elements with the `data-polar-checkout` attribute.
   * The Checkout Link is either the `href` attribute for a link element or the value of `data-polar-checkout` attribute.
   *
   * The theme can be optionally set using the `data-polar-checkout-theme` attribute.
   *
   * @example
   * ```html
   * <a href="https://buy.polar.sh/polar_cl_123" data-polar-checkout data-polar-checkout-theme="dark">Checkout</a>
   * ```
   */
  static init(): void;
  /**
   * Close the embedded checkout.
   */
  close(): void;
  /**
   * Add an event listener to the embedded checkout events.
   *
   * @param type
   * @param listener
   */
  addEventListener(type: 'loaded', listener: (event: CustomEvent<EmbedCheckoutMessageLoaded>) => void, options?: AddEventListenerOptions | boolean): void;
  addEventListener(type: 'close', listener: (event: CustomEvent<EmbedCheckoutMessageClose>) => void, options?: AddEventListenerOptions | boolean): void;
  addEventListener(type: 'confirmed', listener: (event: CustomEvent<EmbedCheckoutMessageConfirmed>) => void, options?: AddEventListenerOptions | boolean): void;
  addEventListener(type: 'success', listener: (event: CustomEvent<EmbedCheckoutMessageSuccess>) => void, options?: AddEventListenerOptions | boolean): void;
  /**
   * Remove an event listener from the embedded checkout events.
   *
   * @param type
   * @param listener
   */
  removeEventListener(type: 'loaded', listener: (event: CustomEvent<EmbedCheckoutMessageLoaded>) => void): void;
  removeEventListener(type: 'close', listener: (event: CustomEvent<EmbedCheckoutMessageClose>) => void): void;
  removeEventListener(type: 'confirmed', listener: (event: CustomEvent<EmbedCheckoutMessageConfirmed>) => void): void;
  removeEventListener(type: 'success', listener: (event: CustomEvent<EmbedCheckoutMessageSuccess>) => void): void;
  private static checkoutElementClickHandler;
  /**
   * Default action for the `loaded` event: remove the loader spinner.
   */
  private handleLoaded;
  /**
   * Default action for the `close` event: remove the embedded checkout from
   * the DOM, unless closing has been locked by a prior `confirmed` event.
   */
  private handleClose;
  /**
   * Default action for the `confirmed` event: lock closing while the
   * checkout is being processed.
   */
  private handleConfirmed;
  /**
   * Default action for the `success` event: re-enable closing and, if
   * requested, redirect the parent window to the `successURL`.
   */
  private handleSuccess;
  /**
   * Handle window message events from the embedded checkout iframe.
   *
   * Dispatches a cancelable `CustomEvent` to consumer listeners first, then
   * runs the default action unless a listener called `event.preventDefault()`.
   */
  private handleWindowMessage;
}
declare global {
  interface PolarWindow {
    EmbedCheckout: typeof EmbedCheckout;
  }
  interface Window {
    Polar: Partial<PolarWindow>;
  }
}
//#endregion
export { EmbedCheckout as PolarEmbedCheckout };