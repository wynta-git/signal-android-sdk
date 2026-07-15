#import "WyntaSDK.h"
#import "WyntaInAppPopupWindow.h"
#import <objc/runtime.h>
#import <React/RCTLog.h>

static WyntaSDKModule *sharedInstance = nil;
static NSDictionary *coldStartNotification = nil;
static WyntaInAppPopupWindow *currentPopup = nil;

@implementation WyntaSDKModule

RCT_EXPORT_MODULE(WyntaSDKModule);

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        sharedInstance = self;
    }
    return self;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"wynta_push_interaction", @"wynta_inapp_interaction"];
}

RCT_EXPORT_METHOD(showInAppPopup:(NSString *)notificationId
                       campaignId:(NSString *)campaignId
                         imageUrl:(NSString *)imageUrl
                         ctaLabel:(NSString *)ctaLabel
                        ctaAction:(NSString *)ctaAction
                         ctaValue:(NSString *)ctaValue) {
    if (currentPopup) {
        // A popup is already showing — checkInboxThunk already guards this on the JS
        // side, but guard here too since this method could in principle be called directly.
        return;
    }

    currentPopup = [[WyntaInAppPopupWindow alloc] init];
    [currentPopup presentWithImageURL:imageUrl
                              ctaAction:ctaAction
                               ctaValue:ctaValue
                               ctaLabel:ctaLabel
                     interactionHandler:^(NSString *interactionType, NSString *label) {
        NSMutableDictionary *params = [NSMutableDictionary dictionary];
        params[@"interaction_type"] = interactionType;
        params[@"notification_id"] = notificationId;
        params[@"campaign_id"] = campaignId;
        params[@"cta_label"] = label ?: [NSNull null];

        if (sharedInstance) {
            [sharedInstance sendEventWithName:@"wynta_inapp_interaction" body:params];
        }

        if (![interactionType isEqualToString:@"shown"]) {
            currentPopup = nil;
        }
    }];
}

// Automatically swizzle setDelegate: on UNUserNotificationCenter when the module class loads
+ (void)load {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        Class class = [UNUserNotificationCenter class];
        SEL originalSelector = @selector(setDelegate:);
        SEL swizzledSelector = @selector(wynta_setDelegate:);
        
        Method originalMethod = class_getInstanceMethod(class, originalSelector);
        Method swizzledMethod = class_getInstanceMethod(class, swizzledSelector);
        
        if (originalMethod && swizzledMethod) {
            method_exchangeImplementations(originalMethod, swizzledMethod);
        }
    });
}

// Swizzle the delegate class to intercept the click handler and foreground display handler
+ (void)swizzleDelegate:(id<UNUserNotificationCenterDelegate>)delegate {
    Class class = [delegate class];
    
    // 1. Swizzle didReceiveNotificationResponse:withCompletionHandler: (Clicks)
    SEL originalSelector = @selector(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:);
    SEL swizzledSelector = @selector(wynta_userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:);
    
    if (![delegate respondsToSelector:swizzledSelector]) {
        Method originalMethod = class_getInstanceMethod(class, originalSelector);
        if (originalMethod) {
            class_addMethod(class,
                            swizzledSelector,
                            method_getImplementation(originalMethod),
                            method_getTypeEncoding(originalMethod));
            Method swizzledMethod = class_getInstanceMethod(class, swizzledSelector);
            if (swizzledMethod) {
                method_exchangeImplementations(originalMethod, swizzledMethod);
            }
        } else {
            class_addMethod(class,
                            originalSelector,
                            (IMP)wynta_didReceiveNotificationResponse,
                            "v@:@@?");
        }
    }
    
    // 2. Swizzle willPresentNotification:withCompletionHandler: (Foreground Banners)
    SEL originalWillPresent = @selector(userNotificationCenter:willPresentNotification:withCompletionHandler:);
    SEL swizzledWillPresent = @selector(wynta_userNotificationCenter:willPresentNotification:withCompletionHandler:);
    
    if (![delegate respondsToSelector:swizzledWillPresent]) {
        Method originalMethod = class_getInstanceMethod(class, originalWillPresent);
        if (originalMethod) {
            class_addMethod(class,
                            swizzledWillPresent,
                            method_getImplementation(originalMethod),
                            method_getTypeEncoding(originalMethod));
            Method swizzledMethod = class_getInstanceMethod(class, swizzledWillPresent);
            if (swizzledMethod) {
                method_exchangeImplementations(originalMethod, swizzledMethod);
            }
        } else {
            class_addMethod(class,
                            originalWillPresent,
                            (IMP)wynta_willPresentNotification,
                            "v@:@@?");
        }
    }
}

// Handle parsing of push payload
+ (void)handleNotificationResponse:(NSDictionary *)userInfo actionIdentifier:(NSString *)actionIdentifier {
    NSString *campaignId = userInfo[@"campaign_id"] ?: userInfo[@"wynta_campaign_id"];
    if (!campaignId) return;
    
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"campaign_id"] = campaignId;
    params[@"campaign_name"] = userInfo[@"campaign_name"] ?: [NSNull null];
    params[@"notification_type"] = userInfo[@"notification_type"] ?: @"promotional";
    params[@"channel"] = userInfo[@"channel"] ?: @"push";
    params[@"template_id"] = userInfo[@"template_id"] ?: [NSNull null];
    
    if (actionIdentifier && ![actionIdentifier isEqualToString:UNNotificationDefaultActionIdentifier]) {
        params[@"action_id"] = actionIdentifier;
    }
    if (userInfo[@"deep_link"]) {
        params[@"deep_link"] = userInfo[@"deep_link"];
    }
    
    // Store as cold start notification
    coldStartNotification = params;
    
    if (sharedInstance) {
        [sharedInstance sendEventWithName:@"wynta_push_interaction" body:params];
    }
}

// Expose method to JavaScript to read the cold start notification payload
RCT_EXPORT_METHOD(getColdStartNotification:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    if (coldStartNotification) {
        NSDictionary *notification = coldStartNotification;
        coldStartNotification = nil;
        resolve(notification);
    } else {
        resolve([NSNull null]);
    }
}

// Native Key-Value storage methods using NSUserDefaults
RCT_EXPORT_METHOD(getStoredString:(NSString *)key resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    NSString *value = [[NSUserDefaults standardUserDefaults] stringForKey:key];
    resolve(value ?: [NSNull null]);
}

RCT_EXPORT_METHOD(setStoredString:(NSString *)key value:(NSString *)value resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    [[NSUserDefaults standardUserDefaults] setObject:value forKey:key];
    [[NSUserDefaults standardUserDefaults] synchronize];
    resolve(@(YES));
}

RCT_EXPORT_METHOD(removeStoredString:(NSString *)key resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:key];
    [[NSUserDefaults standardUserDefaults] synchronize];
    resolve(@(YES));
}

@end

// Inject category to intercept setDelegate: on UNUserNotificationCenter
@interface UNUserNotificationCenter (Wynta)
@end

@implementation UNUserNotificationCenter (Wynta)

- (void)wynta_setDelegate:(id<UNUserNotificationCenterDelegate>)delegate {
    if (delegate) {
        [WyntaSDKModule swizzleDelegate:delegate];
    }
    // Call the original setDelegate (which currently points to the swizzled method)
    [self wynta_setDelegate:delegate];
}

@end

// Swizzled C function that processes the click response and passes control back to the original delegate method
static void wynta_didReceiveNotificationResponse(id self, SEL _cmd, UNUserNotificationCenter *center, UNNotificationResponse *response, void (^completionHandler)(void)) {
    NSDictionary *userInfo = response.notification.request.content.userInfo;
    NSString *actionIdentifier = response.actionIdentifier;
    
    [WyntaSDKModule handleNotificationResponse:userInfo actionIdentifier:actionIdentifier];
    
    SEL swizzledSel = @selector(wynta_userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:);
    if ([self respondsToSelector:swizzledSel]) {
        void (*originalImp)(id, SEL, UNUserNotificationCenter *, UNNotificationResponse *, void (^)(void)) =
            (void (*)(id, SEL, UNUserNotificationCenter *, UNNotificationResponse *, void (^)(void)))[self methodForSelector:swizzledSel];
        if (originalImp) {
            originalImp(self, _cmd, center, response, completionHandler);
        }
    } else {
        if (completionHandler) {
            completionHandler();
        }
    }
}

// Swizzled C function that forces iOS to display heads-up banners when the app is in the foreground
static void wynta_willPresentNotification(id self, SEL _cmd, UNUserNotificationCenter *center, UNNotification *notification, void (^completionHandler)(UNNotificationPresentationOptions)) {
    UNNotificationPresentationOptions presentationOptions = UNNotificationPresentationOptionSound | UNNotificationPresentationOptionBadge;
    
    #if __IPHONE_OS_VERSION_MAX_ALLOWED >= 140000
    if (@available(iOS 14.0, *)) {
        presentationOptions |= UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList;
    } else {
        presentationOptions |= UNNotificationPresentationOptionAlert;
    }
    #else
    presentationOptions |= UNNotificationPresentationOptionAlert;
    #endif
    
    SEL swizzledSel = @selector(wynta_userNotificationCenter:willPresentNotification:withCompletionHandler:);
    if ([self respondsToSelector:swizzledSel]) {
        void (*originalImp)(id, SEL, UNUserNotificationCenter *, UNNotification *, void (^)(UNNotificationPresentationOptions)) =
            (void (*)(id, SEL, UNUserNotificationCenter *, UNNotification *, void (^)(UNNotificationPresentationOptions)))[self methodForSelector:swizzledSel];
        if (originalImp) {
            originalImp(self, _cmd, center, notification, completionHandler);
        } else {
            completionHandler(presentationOptions);
        }
    } else {
        completionHandler(presentationOptions);
    }
}
