/**
 * Prints what a dialog shows (a receipt, an A4 document, label sheets). A dialog sits in the middle of the screen and
 * would print there too, so a copy goes at the top of the page for the printer and is removed afterwards. The styles
 * (styles.scss, .print-copy) show only the copy on paper and never on screen.
 */
export function printCopy(el: HTMLElement): void {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.classList.add('print-copy');
  document.body.append(copy);
  const done = () => copy.remove();
  window.addEventListener('afterprint', done, { once: true });
  window.print();
  setTimeout(done, 60_000); // in case afterprint never comes
}
