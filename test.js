TextModifierBehavior=function(_super){function TextModifierBehavior(){_super.apply(this,arguments),this.pixelated=!0}return __extends(TextModifierBehavior,_super),TextModifierBehavior.prototype.awake=function(){var texture=this.actor.textRenderer.__inner.texture;this.pixelated===!0?(texture.magFilter=THREE.NearestFilter,texture.minFilter=THREE.NearestFilter):this.pixelated===!1&&(texture.magFilter=THREE.LinearFilter,texture.minFilter=THREE.LinearFilter)},TextModifierBehavior.prototype.update=function(){},TextModifierBehavior}(Sup.Behavior);Sup.registerBehavior(TextModifierBehavior);




