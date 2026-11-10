import { fireEvent, screen, within } from '@testing-library/react'

/** Opens the MUI select labelled `label` (optionally inside `container`) and picks the option named `option`. */
export async function chooseOption(label: string, option: string, container: HTMLElement = document.body) {
  fireEvent.mouseDown(within(container).getByRole('combobox', { name: label }))
  const listbox = await screen.findByRole('listbox')
  fireEvent.click(within(listbox).getByRole('option', { name: option }))
}
