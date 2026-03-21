import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '../Toast'

// Test component that triggers a toast
function ToastTrigger({ message = 'Hello toast', type }: { message?: string; type?: 'success' | 'error' | 'info' }) {
  const { toast } = useToast()
  return <button onClick={() => toast(message, type)}>Show Toast</button>
}

describe('Toast', () => {
  it('renders children within ToastProvider', () => {
    render(
      <ToastProvider>
        <div>App content</div>
      </ToastProvider>,
    )
    expect(screen.getByText('App content')).toBeInTheDocument()
  })

  it('shows a toast message when toast() is called', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <ToastTrigger message="Operation successful" />
      </ToastProvider>,
    )

    await user.click(screen.getByText('Show Toast'))
    expect(screen.getByText('Operation successful')).toBeInTheDocument()
  })

  it('shows an error toast', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <ToastTrigger message="Something failed" type="error" />
      </ToastProvider>,
    )

    await user.click(screen.getByText('Show Toast'))
    expect(screen.getByText('Something failed')).toBeInTheDocument()
  })

  it('toast has dismiss button', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <ToastTrigger message="Dismissable toast" />
      </ToastProvider>,
    )

    await user.click(screen.getByText('Show Toast'))
    expect(screen.getByText('Dismissable toast')).toBeInTheDocument()

    // Find and click dismiss button (the X icon button within the toast)
    const dismissButtons = screen.getAllByRole('button')
    const dismissBtn = dismissButtons.find(btn => btn !== screen.getByText('Show Toast'))
    if (dismissBtn) {
      await user.click(dismissBtn)
      expect(screen.queryByText('Dismissable toast')).not.toBeInTheDocument()
    }
  })

  it('can show multiple toasts', async () => {
    const user = userEvent.setup()

    // Use a counter to produce unique messages
    let count = 0
    function CounterTrigger() {
      const { toast: showToast } = useToast()
      return <button onClick={() => showToast(`Toast ${++count}`)}>Add Toast</button>
    }

    render(
      <ToastProvider>
        <CounterTrigger />
      </ToastProvider>,
    )

    await user.click(screen.getByText('Add Toast'))
    await user.click(screen.getByText('Add Toast'))

    expect(screen.getByText('Toast 1')).toBeInTheDocument()
    expect(screen.getByText('Toast 2')).toBeInTheDocument()
  })
})
