import Header from './Header';
import NewNoteModal from '@components/modals/NewNoteModal';
import Onboarding, {useOnboardingStatus} from './Onboarding';
import React, {useRef} from 'react';
import Sidebar from './Sidebar';
import {Navigate, ScrollRestoration} from '@tryghost/admin-x-framework';
import {useCurrentUser} from '@tryghost/admin-x-framework/api/currentUser';
import {useKeyboardShortcuts} from '@hooks/use-keyboard-shortcuts';

const Layout: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({children, ...props}) => {
    const {isOnboarded} = useOnboardingStatus();
    const {data: currentUser, isLoading} = useCurrentUser();
    const containerRef = useRef<HTMLDivElement>(null);

    const {isNewNoteModalOpen, setIsNewNoteModalOpen} = useKeyboardShortcuts();

    if (isLoading || !currentUser) {
        return null;
    }

    if (!isOnboarded) {
        return <Navigate to={`/welcome`} replace />;
    }

    return (
        <div ref={containerRef} className={`h-screen w-full ${isOnboarded && 'overflow-y-auto'}`}>
            <ScrollRestoration containerRef={containerRef} />
            <div className='relative mx-auto flex max-w-page flex-col' {...props}>
                {isOnboarded ?
                    <>
                        <div className='grid grid-cols-[auto_320px] items-start'>
                            <div className='z-0'>
                                <Header />
                                <div className='px-8'>
                                    {children}
                                </div>
                            </div>
                            <Sidebar />
                        </div>
                    </> :
                    <Onboarding />
                }
            </div>

            <NewNoteModal
                open={isNewNoteModalOpen}
                onOpenChange={setIsNewNoteModalOpen}
            />
        </div>
    );
};

export default Layout;
