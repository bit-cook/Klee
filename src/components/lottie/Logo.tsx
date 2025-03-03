import Lottie, { LottieComponentProps } from 'lottie-react'
import Logo from '@/assets/lottie/logo.json'

export default function LogoLottie(props: Omit<LottieComponentProps, 'animationData'>) {
  return <Lottie animationData={Logo} {...props} />
}
