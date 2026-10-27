import { Fragment, lazy, type ReactNode } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/AppShell'
import { DataProvider } from '@/app/data'
import { Gate } from '@/app/Gate'
import { BillDetail } from '@/pages/BillDetail'
import { BillForm } from '@/pages/BillForm'
import { Bills } from '@/pages/Bills'
import { Dashboard } from '@/pages/Dashboard'
import { EntryForm, TransferForm } from '@/pages/EntryForms'
import { Money } from '@/pages/Money'
import { More } from '@/pages/More'
import { NotFound } from '@/pages/NotFound'
import { Parties } from '@/pages/Parties'
import { PartyDetail } from '@/pages/PartyDetail'
import { Lookup } from '@/pages/Lookup'
import { PartyForm } from '@/pages/PartyForm'
import { PaymentDetail } from '@/pages/PaymentDetail'
import { PaymentForm } from '@/pages/PaymentForm'
import { DARK_THEMES, useTheme } from '@/lib/theme'

const BillCopyPage = lazy(() => import('@/docs/BillCopy').then((m) => ({ default: m.BillCopyPage })))
const StatementPage = lazy(() => import('@/docs/Statement').then((m) => ({ default: m.StatementPage })))
const Reports = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })))
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })))
const Stock = lazy(() => import('@/pages/Stock').then((m) => ({ default: m.Stock })))
const ItemForm = lazy(() => import('@/pages/Stock').then((m) => ({ default: m.ItemForm })))
const ItemDetail = lazy(() => import('@/pages/Stock').then((m) => ({ default: m.ItemDetail })))
const AccountForm = lazy(() => import('@/pages/AccountPages').then((m) => ({ default: m.AccountForm })))
const AccountDetail = lazy(() => import('@/pages/AccountPages').then((m) => ({ default: m.AccountDetail })))
const QuickAddAccounts = lazy(() => import('@/pages/QuickAddAccounts').then((m) => ({ default: m.QuickAddAccounts })))
const Photos = lazy(() => import('@/pages/Photos').then((m) => ({ default: m.Photos })))
const PhotoDetail = lazy(() => import('@/pages/Photos').then((m) => ({ default: m.PhotoDetail })))

/** Forms read their starting values once, so give each URL a fresh instance. */
function Fresh({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  return <Fragment key={pathname + search}>{children}</Fragment>
}

function ThemedToaster() {
  const { resolved } = useTheme()
  return <Toaster position="top-center" richColors closeButton theme={DARK_THEMES.has(resolved) ? 'dark' : 'light'} />
}

export default function App() {
  return (
    <DataProvider>
      <HashRouter>
        <Gate>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />

              <Route path="parties" element={<Parties />} />
              <Route path="parties/new" element={<Fresh><PartyForm /></Fresh>} />
              <Route path="parties/:id" element={<PartyDetail />} />
              <Route path="parties/:id/edit" element={<Fresh><PartyForm /></Fresh>} />
              <Route path="parties/:id/statement" element={<StatementPage />} />
              <Route path="lookup" element={<Lookup />} />

              <Route path="bills" element={<Bills />} />
              <Route path="bills/new/:kind" element={<Fresh><BillForm mode="new" /></Fresh>} />
              <Route path="bills/:id" element={<BillDetail />} />
              <Route path="bills/:id/edit" element={<Fresh><BillForm mode="edit" /></Fresh>} />
              <Route path="bills/:id/return" element={<Fresh><BillForm mode="return" /></Fresh>} />
              <Route path="bills/:id/copy" element={<BillCopyPage />} />
              <Route path="photos" element={<Photos />} />
              <Route path="photos/:id" element={<PhotoDetail />} />

              <Route path="payments/new" element={<Fresh><PaymentForm mode="new" /></Fresh>} />
              <Route path="payments/:id" element={<PaymentDetail />} />
              <Route path="payments/:id/edit" element={<Fresh><PaymentForm mode="edit" /></Fresh>} />

              <Route path="money" element={<Money />} />
              <Route path="money/accounts/new" element={<Fresh><AccountForm /></Fresh>} />
              <Route path="money/accounts/quick" element={<Fresh><QuickAddAccounts /></Fresh>} />
              <Route path="money/accounts/:id" element={<AccountDetail />} />
              <Route path="money/accounts/:id/edit" element={<Fresh><AccountForm /></Fresh>} />
              <Route path="money/entry/new" element={<Fresh><EntryForm /></Fresh>} />
              <Route path="money/entry/:id" element={<Fresh><EntryForm /></Fresh>} />
              <Route path="money/transfer/new" element={<Fresh><TransferForm /></Fresh>} />
              <Route path="money/transfer/:id" element={<Fresh><TransferForm /></Fresh>} />

              <Route path="stock" element={<Stock />} />
              <Route path="stock/new" element={<Fresh><ItemForm /></Fresh>} />
              <Route path="stock/:id" element={<ItemDetail />} />
              <Route path="stock/:id/edit" element={<Fresh><ItemForm /></Fresh>} />

              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="more" element={<More />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Gate>
      </HashRouter>
      <ThemedToaster />
    </DataProvider>
  )
}
