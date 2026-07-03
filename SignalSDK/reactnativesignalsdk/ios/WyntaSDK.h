#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UserNotifications/UserNotifications.h>

@interface WyntaSDKModule : RCTEventEmitter <RCTBridgeModule>

+ (void)swizzleDelegate:(id<UNUserNotificationCenterDelegate>)delegate;
+ (void)handleNotificationResponse:(NSDictionary *)userInfo actionIdentifier:(NSString *)actionIdentifier;

@end
