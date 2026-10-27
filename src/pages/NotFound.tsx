import { SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/Field'
import { Page } from '@/components/Page'
import { useLocale } from '@/app/locale'

export function NotFound() {
  const { t } = useLocale()
  return (
    <Page title={t('app_name')} back>
      <EmptyState
        icon={<SearchX />}
        title={t('nothing_yet')}
        action={
          <Button size="touch" render={<Link to="/" />} nativeButton={false}>
            {t('nav_home')}
          </Button>
        }
      />
    </Page>
  )
}
