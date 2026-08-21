import { BrandWordmark, FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

type HankunBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * Render the Hankun brand mark with the presentation requested by its host surface.
 * DeepSeek Harness style: whale mark for the sidebar and hero.
 * @param props - Host-supplied mark presentation.
 * @returns the whale mark.
 */
export function HankunBrandMark({ size, className }: HankunBrandMarkProps) {
  return <FishLogo size={size} className={className} />
}

/**
 * Render the Hankun brand name artwork without its independently slotted mark.
 * DeepSeek Harness style: "deepseek" + HARNESS badge, hover shows version.
 * @returns the wordmark.
 */
export function HankunBrandName() {
  return <BrandWordmark includeMark={false} />
}
